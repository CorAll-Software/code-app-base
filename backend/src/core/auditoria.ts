import { execProcedure } from './db/connection';

/*
    Auditoría · lo que el backend aporta a la bitácora.

    Las escrituras (INSERT/UPDATE/DELETE) NO se registran desde aquí: las audita
    sola la base, con el trigger genérico que instala `auditoria.activar_tabla`.
    No depende de que un endpoint se acuerde de llamar a nada, y por eso no hay
    (ni debe haber) un `logAudit()` que invocar en cada handler.

    Lo que el backend sí tiene que aportar es lo que la base no puede saber:

      1. QUIÉN actúa y desde qué dispositivo, más la ip / user agent / endpoint.
         Eso viaja en el propio payload de la función SQL y lo fija
         `auditoria.contexto(req)` como variables de transacción.
      2. Los eventos que ningún trigger puede ver: lecturas, descargas y los
         intentos que NO llegan a tocar una fila (login fallido, acceso
         denegado). Para eso está `registrarEvento()`.
*/

/** Operaciones de `auditoria.enum_operacion` que declara la capa HTTP. */
export type OperacionAuditoria =
    | 'LECTURA'
    | 'DESCARGA'
    | 'EXPORTACION'
    | 'LOGIN'
    | 'LOGIN_FALLIDO'
    | 'ACCESO_DENEGADO';

/**
 * Ip y user agent de la petición. La base nunca los conoce por su cuenta: son
 * datos de HTTP que solo existen si la ruta se los pasa.
 *
 * `x-forwarded-for` puede traer una cadena de proxies (`cliente, proxy1,
 * proxy2`): interesa el primero, que es el cliente real.
 */
export const trazas = (headers: any) => ({
    ip: (headers?.['x-forwarded-for'] || headers?.['x-real-ip'] || '').toString().split(',')[0].trim() || null,
    user_agent: (headers?.['user-agent'] || '').toString() || null,
});

/**
 * Bloque de contexto que se mezcla en el `req json` de toda función `save_*` /
 * `delete_*` / `update_*`:
 *
 *     const data = { ...body, ...contextoAuditoria(user, headers, 'PUT /users') }
 *
 * Incluye `user_cr` y `token_cr`, que además de alimentar la auditoría son las
 * columnas de auditoría de fila que el sistema exige desde siempre
 * (postgres/README.md). Una sola línea cubre las dos cosas.
 *
 * Va en el MISMO payload de la llamada, no en una llamada aparte: cada
 * `execProcedure` es su propia transacción implícita sobre una conexión
 * cualquiera del pool, así que un `SELECT auditoria.contexto(...)` separado
 * moriría con su transacción antes de servir de nada — y envolver ambas en
 * BEGIN/COMMIT costaría dos viajes extra a la base por operación.
 */
export const contextoAuditoria = (user: any, headers?: any, endpoint?: string) => ({
    user_cr: user?.id ?? null,
    token_cr: user?.sid ?? null,
    // El rol EN EL MOMENTO de la acción. Se guarda tal cual porque es lo que
    // vale como evidencia: si mañana se le quita el rol, la bitácora debe
    // seguir diciendo con qué privilegio actuó ese día.
    rol: Array.isArray(user?.roles) ? user.roles.map((r: any) => r?.name).filter(Boolean).join(', ') || null : null,
    endpoint: endpoint ?? null,
    ...trazas(headers),
});

export interface EventoAuditoria {
    /** Tabla física ('users') o recurso lógico ('archivo', 'sesion'). */
    entidad: string;
    operacion: OperacionAuditoria;
    /** Quién. Puede ser null en un login fallido: aún no hay identidad probada. */
    usuarioId?: number | null;
    idRegistro?: string | number | null;
    /** Sesión de origen (`user.sid`). */
    sesionId?: string | null;
    idCaso?: string | null;
    detalle?: string | null;
    /** Para la ip y el user agent. */
    headers?: any;
    endpoint?: string | null;
    esquema?: string;
}

/**
 * Registra un evento que ningún trigger puede ver.
 *
 * Devuelve `true`/`false` en vez de lanzar, y el llamador decide qué hacer:
 * en una descarga hay que comprobarlo y no entregar el archivo si falló (ver
 * `registrarDescarga`); en un login fallido no tiene sentido negar la respuesta
 * de error por no haber podido anotarla.
 */
export const registrarEvento = async (evento: EventoAuditoria): Promise<boolean> => {
    const { error, result } = await execProcedure('auditoria.registrar_evento_req', [{
        entidad: evento.entidad,
        operacion: evento.operacion,
        usuario_id: evento.usuarioId ?? null,
        id_registro: evento.idRegistro != null ? String(evento.idRegistro) : null,
        sesion_id: evento.sesionId ?? null,
        id_caso: evento.idCaso ?? null,
        detalle: evento.detalle ?? null,
        esquema: evento.esquema ?? 'core',
        endpoint: evento.endpoint ?? null,
        ...trazas(evento.headers),
    }]);

    if (error || result?.error) {
        console.error('[AUDITORIA] No se pudo registrar el evento:', error || result?.error);
        return false;
    }
    return true;
};

/**
 * Registra una descarga ANTES de entregar el archivo o la URL firmada.
 *
 * Firmar una URL de S3 es leer una fila y devolver una cadena: PostgreSQL no
 * dispara triggers en SELECT, así que sin esta llamada la descarga no deja
 * rastro. El orden importa — si no se pudo registrar, no se entrega: una
 * descarga que no se puede auditar no debe ocurrir.
 *
 *     if (!await registrarDescarga({ ... })) return status(500, { message: '...' })
 *     return { url: await getS3ObjectUrl(key) }
 *
 * NOTA: la plantilla no instrumenta la foto de perfil. Su URL se firma en cada
 * listado de usuarios y en cada login, así que auditarla llenaría la bitácora
 * de ruido igual que la rotación de sesiones. Esta función es para las
 * descargas reales que agregue cada proyecto (documentos, comprobantes).
 */
export const registrarDescarga = (
    evento: Omit<EventoAuditoria, 'operacion'>,
): Promise<boolean> => registrarEvento({ ...evento, operacion: 'DESCARGA' });
