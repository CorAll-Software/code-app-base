import { execProcedure } from '@core/db/connection';
import { logAudit, extractClientIp } from '@core/audit.helper';
import { Elysia } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { PERMISSIONS } from '@core/permissions.constants';

const path = '/roles';

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
        const data = { ...bodyData, user_cr: (user as any).id, token_cr: (user as any).sid };

        const result = await execProcedure('core.save_role', [data]);
        if (result.error) {
            return status(400, { message: result.error });
        }
        logAudit({
            userId: (user as any).id,
            module: 'ADMIN',
            tableName: 'roles',
            recordId: result.result?.id,
            action: 'INSERT',
            newData: { ...data, permissions: data.permissions_ids },
            ipAddress: extractClientIp(headers),
            sessionId: (user as any).sid
        });
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
        const data = { ...bodyData, user_cr: (user as any).id, token_cr: (user as any).sid };

        const result = await execProcedure('core.save_role', [data]);
        if (result.error) {
            return status(400, { message: result.error });
        }

        // Datos para auditoría con mapeo de permissions
        const auditNewData = {
            ...data,
            permissions: data.permissions_ids
        };

        logAudit({
            userId: (user as any).id,
            module: 'ADMIN',
            tableName: 'roles',
            recordId: data.id,
            action: data.status === false ? 'DELETE' : 'UPDATE',
            newData: auditNewData,
            ipAddress: extractClientIp(headers),
            sessionId: (user as any).sid
        });
        return result.result;
    }, {
        requirePermission: PERMISSIONS.ROLES.MANAGE
    });
