import { Elysia, t } from 'elysia';
import { execProcedure } from '@core/db/connection';
import { authPlugin } from '@core/auth.guard';

const path = '/notifications';

/**
 * Endpoints de la campana de notificaciones. Todos operan sobre el usuario
 * autenticado (no requieren permiso adicional, solo token válido).
 *
 * Para EMITIR notificaciones desde otros módulos usar createNotification()
 * de ./notifications.helper.ts (persiste + push WebSocket).
 */
export const NotificationsApi = new Elysia()
    .use(authPlugin)
    .get(path, async ({ set, user, query }) => {
        const userId = (user as any).id;
        const [list, unread] = await Promise.all([
            execProcedure('core.list_notifications', [{
                user_id: userId,
                limit: query.limit ? Number(query.limit) : 20,
                offset: query.offset ? Number(query.offset) : 0,
            }]),
            execProcedure('core.count_unread_notifications', [{ user_id: userId }]),
        ]);
        if (list.error) {
            set.status = 400;
            return { message: list.error };
        }
        return {
            notifications: list.result || [],
            unreadCount: unread.result?.count || 0,
        };
    }, {
        requirePermission: null,
        query: t.Object({
            limit: t.Optional(t.Numeric()),
            offset: t.Optional(t.Numeric()),
        })
    })
    .put(`${path}/read-all`, async ({ set, user }) => {
        const result = await execProcedure('core.mark_all_notifications_as_read', [{
            user_id: (user as any).id,
        }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        return result.result;
    }, { requirePermission: null })
    .put(`${path}/:id/read`, async ({ params: { id }, set, user }) => {
        // user_id asegura que solo se puedan marcar notificaciones propias
        const result = await execProcedure('core.mark_notification_as_read', [{
            id,
            user_id: (user as any).id,
        }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        return result.result;
    }, { requirePermission: null });
