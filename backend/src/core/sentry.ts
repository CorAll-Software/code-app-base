import { configServer } from '@/config';

/**
 * Reporte de errores (protocolo Sentry).
 *
 * Cliente propio, sin dependencias: el SDK oficial de Bun arrastra 34 paquetes
 * (8 de ellos de OpenTelemetry) para algo que aquí es un POST con el cuerpo en
 * formato *envelope*. Esto habla el mismo protocolo, así que sirve igual contra
 * un Sentry autoalojado que contra un compatible (GlitchTip, Bugsink…).
 *
 * El DSN no es un secreto — en el navegador viaja en cada petición y solo
 * autoriza a ENVIAR eventos — pero igual vive en `.env` porque es lo que
 * cambia en cada despliegue, no porque haya que protegerlo.
 *
 * Regla de oro de este módulo: **una bitácora que avisa de todo se deja de
 * mirar**. Lo que no es un defecto no entra. Ver `motivoDescarte()`.
 */

/** Se identifica ante la instancia; así un evento raro se rastrea hasta la
 *  versión concreta que lo mandó. Se codifica al usarlo: el `+` de la versión
 *  es un separador en query strings y llegaría como espacio. */
const CLIENTE = `${configServer.appName}/${configServer.version}`;

interface DsnPartes {
    urlEnvelope: string;
    projectId: string;
}

/** `https://<clavePublica>@<host>/<projectId>` → endpoint de envelope. */
const parsearDsn = (dsn: string): DsnPartes | null => {
    try {
        const url = new URL(dsn);
        const projectId = url.pathname.replace(/^\/+/, '');
        if (!url.username || !projectId) return null;
        return {
            projectId,
            urlEnvelope: `${url.protocol}//${url.host}/api/${projectId}/envelope/` +
                `?sentry_key=${url.username}&sentry_version=7&sentry_client=${encodeURIComponent(CLIENTE)}`,
        };
    } catch {
        return null;
    }
};

const dsn = parsearDsn(configServer.sentry.dsn);
const activo = Boolean(dsn) && configServer.sentry.enabled;

/* ─── Clasificación · qué es una incidencia y qué es ruido ───────────────────

   La lista de códigos de PostgreSQL es la pieza clave del backend. En este
   sistema la lógica de negocio vive en funciones plpgsql y señala los errores
   esperables con `RAISE EXCEPTION` ("Ya existe un usuario activo con este
   correo"), que llega siempre como **P0001**. Eso NO es un defecto: es la
   aplicación funcionando. Cualquier otro código —conexión caída, sintaxis,
   función inexistente, violación de integridad— sí lo es. */

/** `RAISE EXCEPTION` de plpgsql: error de negocio, nunca incidencia. */
const PG_ERROR_NEGOCIO = 'P0001';

/** La rutina del motor que atiende un `RAISE` de plpgsql. Viaja en el
 *  ErrorResponse del protocolo, así que está disponible aunque el SQLSTATE
 *  venga envuelto en otro campo. */
const PG_ROUTINE_RAISE = 'exec_stmt_raise';

/**
 * SQLSTATE del error, mirando los dos campos donde Bun puede dejarlo.
 *
 * `SQL.PostgresError` (ver `bun-types/sql.d.ts`) expone `code` y `errno`, y el
 * reparto no es el obvio: en `code` va el código propio de Bun
 * (`ERR_POSTGRES_CONNECTION_REFUSED`, `ERR_POSTGRES_SERVER_ERROR`) y el
 * SQLSTATE cae en `errno` — que en Postgres está declarado `string`, mientras
 * que en SQLite y MySQL es `number`. Esa es la pista de que ahí va un `P0001`
 * y no un número de error.
 *
 * Se valida la forma (5 caracteres, dígitos y mayúsculas) en vez de confiar en
 * un campo concreto, así que da igual cuál de los dos lo traiga.
 */
export const sqlStateDe = (error: any): string | undefined => {
    for (const candidato of [error?.errno, error?.code]) {
        if (typeof candidato === 'string' && /^[0-9A-Z]{5}$/.test(candidato)) return candidato;
    }
    return undefined;
};

/** ¿Viene del servidor de base de datos (ErrorResponse) o es de Bun/la red? */
const esErrorDelMotor = (error: any): boolean =>
    Boolean(error?.routine || error?.severity || error?.severity_local);

/** Avisamos una sola vez si no sabemos leer el SQLSTATE de un error del motor:
 *  es preferible enterarse a que el filtro falle en silencio. */
let avisadoSqlStateIlegible = false;

/**
 * Motivos por los que un error NO entra en la bitácora.
 * Devuelve el motivo (para el log local) o `null` si sí debe reportarse.
 */
const motivoDescarte = (error: unknown): string | null => {
    const err = error as any;

    /*
      Errores de negocio de plpgsql.

      En este sistema la lógica vive en funciones SQL que señalan lo esperable
      con `RAISE EXCEPTION` ("Ya existe un usuario activo con este correo").
      Eso NO es un defecto y no puede entrar aquí: es el caso más frecuente con
      diferencia, y llenaría la bitácora hasta volverla inútil.

      Se reconoce por dos vías independientes, a propósito: lo esperado es que
      el SQLSTATE llegue en `errno`, pero eso está deducido de los tipos de Bun,
      no comprobado contra una base real.
        1. SQLSTATE P0001, venga en `errno` o en `code`.
        2. `routine = exec_stmt_raise`, la rutina del motor que atiende un RAISE.
           Viaja siempre en el ErrorResponse y no depende de cómo lo envuelva Bun.

      Si alguna vez ves en la bitácora incidencias con mensajes de negocio
      ("Ya existe un usuario activo con este correo"), el filtro falló: mira la
      etiqueta `pg_code` del evento, que lleva lo que sí se pudo leer.
    */
    const sqlState = sqlStateDe(err);
    if (sqlState === PG_ERROR_NEGOCIO) return 'error de negocio (RAISE EXCEPTION / P0001)';
    if (err?.routine === PG_ROUTINE_RAISE) return 'error de negocio (routine exec_stmt_raise)';

    // Error del motor cuyo SQLSTATE no supimos leer: se reporta igual (mejor
    // un falso positivo que perder un defecto), pero dejamos constancia para
    // poder afinar el filtro en cuanto se vea uno real.
    if (esErrorDelMotor(err) && !sqlState && !avisadoSqlStateIlegible) {
        avisadoSqlStateIlegible = true;
        console.warn('[SENTRY] No se pudo leer el SQLSTATE de un error de PostgreSQL. ' +
            'Revisa el filtro de ruido en core/sentry.ts si ves errores de negocio en la bitácora. ' +
            'Campos disponibles:', Object.keys(err ?? {}));
    }

    const mensaje = error instanceof Error ? error.message : String(error ?? '');

    // El cliente cortó la conexión a mitad de respuesta. No es culpa nuestra.
    if (/aborted|ECONNRESET|socket hang up|The operation was aborted/i.test(mensaje)) {
        return 'conexión cortada por el cliente';
    }

    return null;
};

/* ─── Límite de ruido · que un fallo en bucle no inunde la instancia ─────────

   Un error dentro de un job que corre cada minuto, o en un endpoint que el
   frontend reintenta, genera miles de eventos idénticos. Dos frenos:
   deduplicación por huella durante una ventana, y tope duro por minuto. */

/** Cuánto se silencia una huella ya vista. */
const VENTANA_DEDUP_MS = 60_000;
/** Ventana sobre la que se cuenta el tope de eventos. */
const VENTANA_TASA_MS = 60_000;
const MAX_EVENTOS_POR_MINUTO = 30;

const vistos = new Map<string, number>();
let ventanaInicio = Date.now();
let enviadosEnVentana = 0;

const superaLimite = (huella: string): boolean => {
    const ahora = Date.now();

    if (ahora - ventanaInicio > VENTANA_TASA_MS) {
        ventanaInicio = ahora;
        enviadosEnVentana = 0;
        // Aprovechamos para no dejar crecer el mapa sin fin.
        for (const [clave, visto] of vistos) {
            if (ahora - visto > VENTANA_DEDUP_MS) vistos.delete(clave);
        }
    }

    const ultimoVisto = vistos.get(huella);
    if (ultimoVisto && ahora - ultimoVisto < VENTANA_DEDUP_MS) return true;

    if (enviadosEnVentana >= MAX_EVENTOS_POR_MINUTO) return true;

    vistos.set(huella, ahora);
    enviadosEnVentana++;
    return false;
};

/* ─── Construcción del evento ───────────────────────────────────────────────*/

const idEvento = () => crypto.randomUUID().replace(/-/g, '');

/** Stack de V8 (`    at fn (file:line:col)`) → frames de Sentry.
 *  Sentry los espera del más antiguo al más reciente, al revés que el texto. */
const parsearStack = (stack?: string) => {
    if (!stack) return undefined;

    const frames = stack
        .split('\n')
        .slice(1)
        .map((linea) => {
            const m = linea.trim().match(/^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
            if (!m) return null;
            const [, funcion, fichero, lin, col] = m;
            return {
                function: funcion || '<anónimo>',
                filename: fichero,
                lineno: parseInt(lin, 10),
                colno: parseInt(col, 10),
                // Lo que no está en node_modules es código nuestro: Sentry lo
                // usa para decidir qué frame culpar al agrupar.
                in_app: !fichero.includes('node_modules'),
            };
        })
        .filter(Boolean);

    return frames.length ? { frames: frames.reverse() } : undefined;
};

interface ContextoError {
    /** Ruta lógica: `POST /api/users`, `JOB purge_user_sessions`, `DB core.save_user`. */
    transaccion?: string;
    /** Etiquetas indexadas y filtrables en Sentry. Valores cortos. */
    etiquetas?: Record<string, string | undefined>;
    /** Datos sueltos para leer en el detalle del evento. */
    extra?: Record<string, unknown>;
    /** Identidad. Nunca mandamos el correo: basta el id para rastrear. */
    usuario?: { id?: number | string; username?: string };
    peticion?: { url?: string; metodo?: string };
    /** Agrupación explícita. Sin esto Sentry agrupa por tipo + mensaje. */
    huella?: string[];
    nivel?: 'error' | 'warning' | 'fatal';
}

/**
 * Envía un error a la bitácora. **Nunca lanza y nunca se espera**: si el
 * reporte falla, la petición del usuario no se entera. Devuelve el id del
 * evento (o `null` si se descartó) por si quieres dejarlo en el log local.
 */
export const reportarError = (error: unknown, contexto: ContextoError = {}): string | null => {
    if (!activo || !dsn) return null;

    if (motivoDescarte(error)) return null;

    // Se etiqueta con lo que haya: si algún día se cuela un error de negocio,
    // esta etiqueta es lo que permite verlo de un vistazo y afinar el filtro.
    const codigoPg = sqlStateDe(error) ?? (error as any)?.code;

    const err = error instanceof Error ? error : new Error(String(error));
    const huella = contexto.huella?.join('|') ?? `${err.name}:${err.message}`;
    if (superaLimite(huella)) return null;

    const eventId = idEvento();

    const evento = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: 'node',
        level: contexto.nivel ?? 'error',
        logger: 'backend',
        environment: configServer.sentry.environment,
        release: configServer.sentry.release,
        server_name: configServer.sentry.serverName,
        transaction: contexto.transaccion,
        fingerprint: contexto.huella,
        exception: {
            values: [{
                type: err.name || 'Error',
                value: err.message,
                stacktrace: parsearStack(err.stack),
                mechanism: { type: 'app-base', handled: true },
            }],
        },
        tags: limpiar({
            ...contexto.etiquetas,
            pg_code: codigoPg ? String(codigoPg) : undefined,
            runtime: 'bun',
        }),
        extra: contexto.extra,
        user: contexto.usuario?.id !== undefined
            ? { id: String(contexto.usuario.id), username: contexto.usuario.username }
            : undefined,
        request: contexto.peticion
            // Sin cabeceras: ahí viaja el Authorization.
            ? { url: contexto.peticion.url, method: contexto.peticion.metodo }
            : undefined,
    };

    const cuerpo = JSON.stringify(evento);
    const envelope =
        JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) + '\n' +
        JSON.stringify({ type: 'event', content_type: 'application/json', length: cuerpo.length }) + '\n' +
        cuerpo + '\n';

    // Fuego y olvido, con tope: la respuesta del usuario no espera a esto.
    fetch(dsn.urlEnvelope, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body: envelope,
        signal: AbortSignal.timeout(configServer.sentry.timeoutMs),
    }).catch((e) => {
        // Si la bitácora está caída no podemos avisar… a la bitácora.
        console.warn('[SENTRY] no se pudo enviar el evento:', e?.message ?? e);
    });

    return eventId;
};

/** Quita las claves sin valor para no mandar `undefined` en las etiquetas. */
function limpiar(obj: Record<string, string | undefined>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')
    ) as Record<string, string>;
}

/**
 * Deja dicho por consola si el reporte quedó activo o no, y por qué.
 * Se llama al arrancar: es la única forma de notar que el DSN no llegó al
 * servidor, que es el error más fácil de cometer al desplegar.
 */
export const initSentry = () => {
    if (activo) {
        console.log(
            `[SENTRY] Reporte de errores ACTIVO · entorno=${configServer.sentry.environment} ` +
            `· proyecto=${dsn!.projectId} · release=${configServer.sentry.release}`
        );
        return;
    }

    if (!configServer.sentry.dsn) {
        console.log('[SENTRY] Reporte de errores DESACTIVADO: define SENTRY_DSN para activarlo.');
    } else if (!dsn) {
        console.warn('[SENTRY] Reporte de errores DESACTIVADO: SENTRY_DSN tiene un formato inválido ' +
            '(se espera https://<clave>@<host>/<projectId>).');
    } else {
        console.log(`[SENTRY] Reporte de errores DESACTIVADO en entorno "${configServer.sentry.environment}" ` +
            '(define SENTRY_ENVIRONMENT o NODE_ENV para activarlo).');
    }
};

/**
 * Errores que nadie atrapó. Sin esto, una promesa rechazada en un job
 * programado desaparece sin dejar rastro.
 */
export const registrarErroresNoAtrapados = () => {
    process.on('unhandledRejection', (razon) => {
        console.error('[unhandledRejection]', razon);
        reportarError(razon, {
            transaccion: 'unhandledRejection',
            nivel: 'fatal',
            etiquetas: { origen: 'proceso' },
        });
    });

    process.on('uncaughtException', (error) => {
        console.error('[uncaughtException]', error);
        reportarError(error, {
            transaccion: 'uncaughtException',
            nivel: 'fatal',
            etiquetas: { origen: 'proceso' },
        });
    });
};

