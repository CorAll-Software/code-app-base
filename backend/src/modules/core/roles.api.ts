import { execProcedure } from '@core/db/connection';
import { contextoAuditoria } from '@core/auditoria';
import { Elysia } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { invalidateUsersPermissions, listUsersByRole } from '@core/permissions';
import { PERMISSIONS } from '@core/permissions.constants';
import { notifyUserReload } from '@modules/core/auth.ws';

const path = '/roles';

/**
 * Editar un rol cambia los permisos efectivos de todos sus miembros. Sin esto
 * seguirían operando con la copia vieja en Redis hasta que su token se renovara.
 * Se invalida la caché (la recarga es perezosa, desde BD) y se avisa por WS a
 * los que estén conectados para que refresquen también su UI.
 */
async function propagarCambioDeRol(roleId: number) {
    const afectados = await listUsersByRole(roleId);
    if (!afectados.length) return;

    await invalidateUsersPermissions(afectados);
    afectados.forEach(notifyUserReload);
}

const ROLE_FIELD_LIMITS: Record<string, { label: string; max: number }> = {
    name: { label: 'Nombre del Rol', max: 100 },
};

function validateRoleFieldLengths(body: Record<string, any>): string | null {
    for (const [field, { label, max }] of Object.entries(ROLE_FIELD_LIMITS)) {
        const value = body[field];
        if (typeof value === 'string' && value.length > max) {
            const excess = value.length - max;
            return `El campo "${label}" excede el límite de ${max} caracteres por ${excess} caracter${excess > 1 ? 'es' : ''}`;
        }
    }
    return null;
}

export const RolesApi = new Elysia()
    .use(authPlugin)
    .get(`${path}`, async ({ status }) => {
        const result = await execProcedure('core.get_roles', [{}]);
        if (result.error) {
            return status(400, { message: result.error });
        }
        return result.result;
    }, {
        // Catálogo de consulta: además de la pantalla de Roles lo necesitan el
        // formulario de usuarios (asignar roles) y el visor de auditoría.
        requirePermission: [
            PERMISSIONS.ROLES.VIEW,
            PERMISSIONS.USUARIOS.VIEW,
            PERMISSIONS.AUDITORIA.VIEW,
        ]
    })
    .post(`${path}`, async ({ body, status, headers, user }) => {
        const bodyData = body as any;
        const lengthError = validateRoleFieldLengths(bodyData);
        if (lengthError) {
            return status(400, { message: lengthError });
        }
        const data = { ...bodyData, ...contextoAuditoria(user, headers, `POST ${path}`) };

        const result = await execProcedure('core.save_role', [data]);
        if (result.error) {
            return status(400, { message: result.error });
        }
        // Un rol recién creado aún no tiene miembros, pero el alta puede venir
        // con permisos ya asignados si se reactiva un rol existente.
        await propagarCambioDeRol(result.result?.id);
        return result.result;
    }, {
        requirePermission: PERMISSIONS.ROLES.MANAGE
    })
    .put(`${path}`, async ({ body, status, headers, user }) => {
        const bodyData = body as any;
        const lengthError = validateRoleFieldLengths(bodyData);
        if (lengthError) {
            return status(400, { message: lengthError });
        }
        const data = { ...bodyData, ...contextoAuditoria(user, headers, `PUT ${path}`) };

        const result = await execProcedure('core.save_role', [data]);
        if (result.error) {
            return status(400, { message: result.error });
        }

        await propagarCambioDeRol(data.id);

        return result.result;
    }, {
        requirePermission: PERMISSIONS.ROLES.MANAGE
    });
