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
        // Además de la pantalla de Roles lo consultan el formulario de usuarios
        // (permisos específicos) y el visor de auditoría (para etiquetarlos).
        requirePermission: [
            PERMISSIONS.ROLES.VIEW,
            PERMISSIONS.USUARIOS.VIEW,
            PERMISSIONS.AUDITORIA.VIEW,
        ]
    });

