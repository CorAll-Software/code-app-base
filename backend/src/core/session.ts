import { createHash, randomBytes } from 'crypto';
import { configServer } from '@/config';
import { execProcedure } from './db/connection';
import { userStore } from './store';

/*
    Sesiones de usuario con refresh token ROTATIVO.

    · El access token (JWT, corto) lleva `sid` = core.user_sessions.id.
    · El refresh token (opaco, largo) tiene la forma `<sid>.<secreto>`; en BD
      solo se guarda SHA-256(secreto), nunca el token en claro.
    · Cada renovación rota el secreto. Si llega un secreto ya rotado, la BD
      revoca la sesión completa (reuso = token comprometido).
    · Redis cachea el estado "activa" para la ruta caliente; la fuente de verdad
      es siempre core.user_sessions, así una revocación surte efecto al instante
      y una caída de Redis no cierra sesiones.
*/

const { refreshExpiresIn } = configServer.auth;

const nowEpoch = () => Math.floor(Date.now() / 1000);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Secreto del refresh token: 48 bytes aleatorios en base64url. */
const newSecret = () => randomBytes(48).toString('base64url');

export interface SessionInfo {
    id: string;
    user_id: number;
    expires_at: number;
    last_used_at: number | null;
    device: string | null;
    ip_address: string | null;
    date_cr: number;
}

export interface SessionContext {
    ip?: string;
    userAgent?: string;
}

export type RevokeReason = 'LOGOUT' | 'MANUAL' | 'PASSWORD_CHANGE' | 'REUSE_DETECTED' | 'ADMIN';

/**
 * Etiqueta legible del dispositivo a partir del user-agent, p.ej.
 * `Chrome · Windows`. Suficiente para que el usuario reconozca sus sesiones
 * sin agregar una dependencia de parsing de user-agents.
 */
export const describeDevice = (userAgent?: string): string => {
    if (!userAgent) return 'Dispositivo desconocido';

    const browser =
        /Edg\//i.test(userAgent) ? 'Edge' :
        /OPR\/|Opera/i.test(userAgent) ? 'Opera' :
        /Chrome\//i.test(userAgent) ? 'Chrome' :
        /Firefox\//i.test(userAgent) ? 'Firefox' :
        /Safari\//i.test(userAgent) ? 'Safari' :
        'Navegador';

    const os =
        /Windows/i.test(userAgent) ? 'Windows' :
        /Android/i.test(userAgent) ? 'Android' :
        /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS' :
        /Mac OS X|Macintosh/i.test(userAgent) ? 'macOS' :
        /Linux/i.test(userAgent) ? 'Linux' :
        'Sistema desconocido';

    return `${browser} · ${os}`;
};

/** Separa `<sid>.<secreto>` y devuelve el hash que se compara contra la BD. */
const parseRefreshToken = (token: string): { sessionId: string; refreshHash: string } | null => {
    const separator = token.indexOf('.');
    if (separator <= 0 || separator === token.length - 1) return null;
    return {
        sessionId: token.slice(0, separator),
        refreshHash: sha256(token.slice(separator + 1)),
    };
};

/**
 * Abre una sesión (login). Devuelve el refresh token en claro: es la única vez
 * que existe fuera del cliente.
 */
export const createSession = async (
    userId: number,
    ctx: SessionContext = {},
): Promise<{ session: SessionInfo; refreshToken: string } | { error: string }> => {
    const secret = newSecret();
    const expiresAt = nowEpoch() + refreshExpiresIn;

    const { result, error } = await execProcedure('core.create_user_session', [{
        user_id: userId,
        refresh_hash: sha256(secret),
        ip_address: ctx.ip ?? null,
        user_agent: ctx.userAgent ?? null,
        device: describeDevice(ctx.userAgent),
        expires_at: expiresAt,
    }]);

    if (error || !result?.id) {
        return { error: error || 'No se pudo abrir la sesión' };
    }

    await userStore.addSession(result.id, userId, refreshExpiresIn);

    return { session: result as SessionInfo, refreshToken: `${result.id}.${secret}` };
};

/**
 * Canjea el refresh token por uno nuevo y extiende la sesión. Ante reuso o
 * sesión cerrada devuelve `{ error }` y la sesión queda revocada en BD y Redis.
 */
export const rotateSession = async (
    token: string,
    ctx: SessionContext = {},
): Promise<{ sessionId: string; userId: number; refreshToken: string; expiresAt: number } | { error: string }> => {
    const parsed = parseRefreshToken(token);
    if (!parsed) return { error: 'Refresh token inválido' };

    const secret = newSecret();
    const expiresAt = nowEpoch() + refreshExpiresIn;

    const { result, error } = await execProcedure('core.rotate_user_session', [{
        id: parsed.sessionId,
        refresh_hash: parsed.refreshHash,
        new_refresh_hash: sha256(secret),
        expires_at: expiresAt,
        ip_address: ctx.ip ?? null,
        user_agent: ctx.userAgent ?? null,
        device: ctx.userAgent ? describeDevice(ctx.userAgent) : null,
    }]);

    if (error) return { error: 'No se pudo renovar la sesión' };

    if (result?.error) {
        // La BD ya la marcó como revocada: sacarla también de la caché.
        await userStore.removeSession(parsed.sessionId);
        return { error: result.error };
    }

    await userStore.addSession(result.id, result.user_id, refreshExpiresIn);

    return {
        sessionId: result.id,
        userId: result.user_id,
        refreshToken: `${result.id}.${secret}`,
        expiresAt: result.expires_at,
    };
};

/**
 * ¿La sesión sigue viva? Redis responde la mayoría de las veces; si no la tiene
 * (caché fría, reinicio o revocación) decide la BD y se vuelve a cachear.
 */
export const isSessionActive = async (sessionId: string): Promise<boolean> => {
    if (await userStore.isSessionCached(sessionId)) return true;

    const { result, error } = await execProcedure('core.get_user_session', [{ id: sessionId }]);
    if (error || !result || result.error || !result.active) return false;

    const ttl = Math.max(1, Number(result.expires_at) - nowEpoch());
    await userStore.addSession(sessionId, result.user_id, ttl);
    return true;
};

/** Sesiones activas del usuario, para la pestaña "Sesiones" del perfil. */
export const listSessions = async (userId: number): Promise<SessionInfo[]> => {
    const { result, error } = await execProcedure('core.get_user_sessions', [{ user_id: userId }]);
    if (error) return [];
    return (result || []) as SessionInfo[];
};

/**
 * Quién ejecuta el cierre. Coincide con el dueño cuando se cierra la sesión a
 * sí mismo desde el perfil, y es el ADMINISTRADOR cuando se fuerza desde la
 * gestión de usuarios. Queda vacío en los cierres automáticos (restablecer
 * contraseña por correo, usuario que ya no puede operar).
 */
export interface RevokeOptions {
    reason?: RevokeReason;
    actorUserId?: number;
    actorSessionId?: string;
    /** Solo en revokeUserSessions: sesión que se conserva abierta. */
    exceptId?: string;
}

/** Cierra UNA sesión del usuario. Solo el dueño (`userId`) puede tenerla cerrada. */
export const revokeSession = async (
    sessionId: string,
    userId: number,
    { reason = 'MANUAL', actorUserId, actorSessionId }: RevokeOptions = {},
): Promise<{ ok: true } | { error: string }> => {
    const { result, error } = await execProcedure('core.revoke_user_session', [{
        id: sessionId,
        user_id: userId,
        reason,
        actor_user: actorUserId ?? null,
        actor_session: actorSessionId ?? null,
    }]);

    if (error) return { error: 'No se pudo cerrar la sesión' };
    if (result?.error) return { error: result.error };

    await userStore.removeSession(sessionId, userId);
    return { ok: true };
};

/**
 * Cierra todas las sesiones del usuario. `exceptId` conserva una (la actual),
 * que es lo que se usa al cambiar la contraseña y en "cerrar las demás".
 * Devuelve los ids cerrados para poder avisar por WebSocket.
 */
export const revokeUserSessions = async (
    userId: number,
    { reason = 'MANUAL', exceptId, actorUserId, actorSessionId }: RevokeOptions = {},
): Promise<string[]> => {
    const { result, error } = await execProcedure('core.revoke_user_sessions', [{
        user_id: userId,
        except_id: exceptId ?? null,
        reason,
        actor_user: actorUserId ?? null,
        actor_session: actorSessionId ?? null,
    }]);

    if (error) return [];

    const ids: string[] = result?.ids || [];
    await userStore.removeSessions(ids, userId);
    return ids;
};
