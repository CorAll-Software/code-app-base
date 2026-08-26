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

const list = () => GET<UserSessionInfo[]>('auth/sessions', { hideNotification: true });

const revoke = (id: string) =>
    DELETE(`auth/sessions/${id}`, { msgSuccess: 'Sesión cerrada' });

const revokeOthers = () =>
    DELETE('auth/sessions', { msgSuccess: 'Se cerraron las demás sesiones' });

export const sessionsService = {
    list,
    revoke,
    revokeOthers,
};
