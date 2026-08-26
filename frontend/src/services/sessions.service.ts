import { DELETE, GET } from '@src/core/http';

/** Una sesión abierta del usuario (core.user_sessions). Fechas en epoch (segundos). */
export interface UserSessionInfo {
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    device: string | null;
    expires_at: number;
    last_used_at: number | null;
    date_cr: number;
    /** `true` en la sesión desde la que se hizo la consulta. */
    current: boolean;
}

/*
    Como el resto de servicios: NUNCA rechazan. Devuelven un valor centinela
    (`[]` / `false`) que el llamador debe comprobar antes de tocar el estado.
    El error ya se le mostró al usuario desde core/http.ts.
*/

const list = (): Promise<UserSessionInfo[]> =>
    GET<UserSessionInfo[]>('auth/sessions')
        .then(res => Array.isArray(res) ? res : [])
        .catch(() => []);

const revoke = (id: string): Promise<boolean> =>
    DELETE(`auth/sessions/${id}`, { msgSuccess: 'Sesión cerrada' })
        .then(() => true)
        .catch(() => false);

const revokeOthers = (): Promise<boolean> =>
    DELETE('auth/sessions', { msgSuccess: 'Se cerraron las demás sesiones' })
        .then(() => true)
        .catch(() => false);

export const sessionsService = {
    list,
    revoke,
    revokeOthers,
};
