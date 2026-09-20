import * as Sentry from '@sentry/react';

/**
 * Reporte de errores (Sentry, instancia autoalojada).
 *
 * El DSN llega por `window._sentryDsn`, que `index.html` rellena con el mismo
 * criterio que usa la analítica: **nunca en localhost**, y solo si la variable
 * de build llegó de verdad. Vacío = módulo apagado, y entonces todo lo de aquí
 * es una función que no hace nada.
 *
 * Lo difícil no es enviar, es no enviar de más. Una bitácora que avisa de todo
 * se deja de mirar. Las dos listas de abajo son el módulo: lo que se ignora en
 * origen y lo que se descarta justo antes de salir.
 */

const dsn = window._sentryDsn;

/**
 * Ruido que no es un defecto de esta aplicación. Se corta en el SDK, antes
 * incluso de construir el evento.
 */
const IGNORAR_MENSAJES: (string | RegExp)[] = [
    // Clásico de AntD y de cualquier layout con observers. Es benigno y el
    // propio estándar dice que se puede ignorar.
    /ResizeObserver loop/i,

    // Extensiones del navegador y scripts de terceros inyectados. No son
    // nuestro código y no podemos arreglarlos.
    /^Script error\.?$/,
    /chrome-extension:\/\//,
    /moz-extension:\/\//,

    // Un despliegue nuevo invalida los chunks del anterior; el usuario que
    // tenía la pestaña abierta falla al navegar. Es un artefacto del despliegue,
    // no un fallo: lo que toca es recargar, y eso se maneja en la UI.
    /Failed to fetch dynamically imported module/i,
    /Importing a module script failed/i,
    /Loading chunk \d+ failed/i,

    // Conectividad del usuario. La app ya se lo dice con un aviso de "sin
    // conexión"; convertirlo en incidencia llena la bitácora de gente en el
    // metro.
    /Failed to fetch$/i,
    /NetworkError when attempting to fetch/i,
    /Load failed$/i,

    // Navegación cancelada por el propio usuario (cerrar pestaña a mitad).
    /AbortError/i,
    /The operation was aborted/i,
];

/** Dominios desde los que SÍ aceptamos errores: descarta los de extensiones. */
const URLS_PERMITIDAS = [window.location.origin, window._routeApi].filter(Boolean);

export const initSentry = () => {
    if (!dsn) {
        // Silencio en desarrollo: no hace falta avisar de algo que está
        // apagado a propósito en localhost.
        return;
    }

    Sentry.init({
        dsn,
        environment: window._sentryEnvironment,
        release: `app-base-frontend@${window._buildInfo?.code ?? 'dev'}`,

        // Solo errores. Nada de tracing, perfilado ni replay: encarecen el
        // bundle, y una instancia autoalojada compatible (GlitchTip, Bugsink…)
        // no siempre los soporta. Si algún día se activan, que sea a propósito.
        tracesSampleRate: 0,

        // No mandamos IP ni cookies. La identidad la ponemos nosotros a mano,
        // y es el id del usuario, no su correo.
        sendDefaultPii: false,

        ignoreErrors: IGNORAR_MENSAJES,
        allowUrls: URLS_PERMITIDAS,

        beforeSend(evento, pista) {
            // Red‑de‑seguridad para lo que se escape de `ignoreErrors`: un
            // error puede llegar sin mensaje reconocible pero con causa clara.
            const original = pista?.originalException as any;

            // Errores que marcamos explícitamente como "esperados" al
            // reportarlos desde http.ts.
            if (original?.__esperado) return null;

            return evento;
        },

        // Migas de pan: útiles para reconstruir qué hizo el usuario. Quitamos
        // las de consola porque en producción son casi siempre vacías y las de
        // fetch porque pueden arrastrar cuerpos con datos personales.
        beforeBreadcrumb(miga) {
            if (miga.category === 'console') return null;
            if (miga.category === 'fetch' || miga.category === 'xhr') {
                // Nos quedamos con método, URL y estado; fuera el resto.
                return { ...miga, data: { ...miga.data, body: undefined } };
            }
            return miga;
        },
    });
};

/** Quién es el usuario actual, para no mirar un stack sin saber a quién le pasó. */
export const identificarUsuario = (usuario?: { id?: number | string; names?: string } | null) => {
    if (!dsn) return;
    if (!usuario?.id) {
        Sentry.setUser(null);
        return;
    }
    // Sin correo a propósito: el id basta para encontrarlo en la BD, y así no
    // se acumulan datos personales en la bitácora.
    Sentry.setUser({ id: String(usuario.id), username: usuario.names });
};

interface ContextoErrorApi {
    endpoint: string;
    metodo: string;
    status?: number;
}

/**
 * Reporta un fallo de API. **Solo se llama para lo que es un defecto** — ver
 * `core/http.ts`, que filtra antes de llegar aquí.
 */
export const reportarErrorApi = (error: unknown, contexto: ContextoErrorApi) => {
    if (!dsn) return;

    Sentry.withScope((scope) => {
        scope.setTag('capa', 'api');
        scope.setTag('endpoint', contexto.endpoint);
        scope.setTag('http_status', String(contexto.status ?? 'sin-respuesta'));
        // Agrupado por endpoint y estado: cien fallos del mismo endpoint son
        // una incidencia, no cien.
        scope.setFingerprint(['api', contexto.metodo, contexto.endpoint, String(contexto.status ?? 0)]);
        scope.setContext('peticion', { ...contexto });
        Sentry.captureException(
            error instanceof Error ? error : new Error(`${contexto.metodo} ${contexto.endpoint} → ${contexto.status}`)
        );
    });
};

/** ¿Está el reporte activo? Lo usa el ErrorBoundary para decidir si muestra el id. */
export const sentryActivo = () => Boolean(dsn);

