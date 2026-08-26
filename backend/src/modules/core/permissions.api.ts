import { execProcedure } from '@core/db/connection';
import { Elysia } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { PERMISSIONS } from '@core/permissions.constants';

const path = '/permissions';

export const PermissionsApi = new Elysia()
    .use(authPlugin)
    .get(`${path}`, async ({ set }) => {
        const result = await execProcedure('core.get_permissions', [{}]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        return result.result;
    }, {
        // El visor de auditoría también lo consulta para etiquetar los permisos
        // que aparecen en los cambios de rol.
        requirePermission: [PERMISSIONS.ROLES.VIEW, PERMISSIONS.AUDITORIA.VIEW]
    });

