import { execProcedure, IPgResult } from '@core/db/connection';
import { notifyUserJson } from '@modules/core/auth.ws';

export interface CreateNotificationParams {
    userId: number;
    title: string;
    message: string;
    /** Tipo visual en el frontend: 'info' | 'success' | 'warning' | 'error' */
    type?: string;
    /** Módulo de origen (informativo, se muestra en la campana) */
    module?: string;
    /** Ruta interna del frontend a la que navega el botón "Ver" (ej. '/clientes') */
    link?: string;
}

/**
 * Crea una notificación para un usuario: la persiste en `core.notifications`
 * y, si el usuario tiene sesión WebSocket activa, se la empuja en tiempo real
 * con la forma { type: 'notification', payload } que espera el frontend
 * (ver frontend/src/App.tsx → handler de mensajes WS).
 *
 * Si el usuario está desconectado no se pierde nada: la verá al abrir la
 * campana (GET /notifications).
 */
export async function createNotification(params: CreateNotificationParams): Promise<IPgResult> {
    const result = await execProcedure('core.create_notification', [{
        user_id: params.userId,
        title: params.title,
        message: params.message,
        type: params.type || 'info',
        module: params.module || null,
        link: params.link || null,
    }]);

    if (result.error) {
        console.error('[NOTIF] Error al crear notificación:', result.error);
        return result;
    }

    notifyUserJson(params.userId, { type: 'notification', payload: result.result });
    return result;
}
