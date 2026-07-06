import { execProcedure } from '@core/db/connection';
import { validateToken } from '@core/jwt';
import { logAudit, extractClientIp } from '@core/audit.helper';
import { Elysia, t } from 'elysia';

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
    .get(`${path}`, async ({ status, headers }) => {
        const user = await validateToken(headers)
        if (user.error) { return status(401, { message: user.error }) }

        console.log(`[GET] ${path} - User: ${user.id}`);
        const result = await execProcedure('core.get_roles', [{}]);
        if (result.error) {
            return status(400, { message: result.error });
        }
        return result.result;
    }, {
        headers: t.Object({ authorization: t.String() })
    })
    .post(`${path}`, async ({ body, status, headers }) => {
        const user = await validateToken(headers)
        if (user.error) { return status(401, { message: user.error }) }

        const bodyData = (body as any).params || body;
        const lengthError = validateRoleFieldLengths(bodyData);
        if (lengthError) {
            return status(400, { message: lengthError });
        }
        const data = { ...bodyData, user_cr: (user as any).id };

        console.log(`[POST] ${path} - User: ${user.id}`, data);
        const result = await execProcedure('core.save_role', [data]);
        if (result.error) {
            return status(400, { message: result.error });
        }
        logAudit({ 
            userId: user.id, 
            module: 'ADMIN', 
            tableName: 'roles', 
            recordId: result.result?.id, 
            action: 'INSERT', 
            newData: { ...data, permissions: data.permissions_ids }, 
            ipAddress: extractClientIp(headers) 
        });
        return result.result;
    }, {
        headers: t.Object({ authorization: t.String() })
    })
    .put(`${path}`, async ({ body, status, headers }) => {
        const user = await validateToken(headers)
        if (user.error) { return status(401, { message: user.error }) }

        const bodyData = (body as any).params || body;
        const lengthError = validateRoleFieldLengths(bodyData);
        if (lengthError) {
            return status(400, { message: lengthError });
        }
        const data = { ...bodyData, user_cr: (user as any).id };

        console.log(`[PUT] ${path} - User: ${user.id}`, data);
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
            userId: user.id, 
            module: 'ADMIN', 
            tableName: 'roles', 
            recordId: data.id, 
            action: data.status === false ? 'DELETE' : 'UPDATE',
            newData: auditNewData,
            ipAddress: extractClientIp(headers) 
        });
        return result.result;
    }, {
        headers: t.Object({ authorization: t.String() })
    });
