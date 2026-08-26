import { execProcedure } from '@core/db/connection';
import { notifySessionClose, notifyUserClose, notifyUserReload } from '@modules/core/auth.ws';
import { revokeUserSessions } from '@core/session';
import { logAudit, extractClientIp } from '@core/audit.helper';
import { Elysia, t } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { PERMISSIONS } from '@core/permissions.constants';
import { buildKeyObject, getS3ObjectUrl, uploadToS3Private } from '@core/s3';
import { configServer } from '@/config';

const { hashSync } = Bun.password;

const path = '/users';

const USER_FIELD_LIMITS: Record<string, { label: string; max: number }> = {
    first_name: { label: 'Nombres', max: 100 },
    last_name: { label: 'Apellidos', max: 100 },
    email: { label: 'Correo Electrónico', max: 150 },
    phone: { label: 'Teléfono', max: 20 },
    dni: { label: 'DNI', max: 20 },
    cargo: { label: 'Cargo', max: 150 },
};

const FOTO_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const FOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function validateUserFieldLengths(body: Record<string, any>): string | null {
    for (const [field, { label, max }] of Object.entries(USER_FIELD_LIMITS)) {
        const value = body[field];
        if (typeof value === 'string' && value.length > max) {
            const excess = value.length - max;
            return `El campo "${label}" excede el límite de ${max} caracteres por ${excess} caracter${excess > 1 ? 'es' : ''}`;
        }
    }
    return null;
}

const enrichWithFileUrl = async (data: any) => {
    if (!data) return data;
    const enrich = async (item: any) => {
        if (!item) return item;
        // Foto de perfil
        if (item.foto_url) {
            item.foto_url = await getS3ObjectUrl(`${configServer.s3.paths.userAvatars}${item.foto_url}`);
        }
        return item;
    };
    if (Array.isArray(data)) return Promise.all(data.map(enrich));
    return enrich(data);
};

export const UsersApi = new Elysia()
    .use(authPlugin)
    .get(`${path}/combo`, async ({ set }) => {
        // Endpoint ligero para selectores de asignación — cualquier usuario autenticado puede usarlo
        const usersResult = await execProcedure('core.get_users', [{}]);
        if (usersResult.error) {
            set.status = 400;
            return { message: usersResult.error };
        }
        return usersResult.result;
    }, {
        requirePermission: null
    })
    .get(`${path}`, async ({ set }) => {
        const usersResult = await execProcedure('core.get_users', [{}]);
        if (usersResult.error) {
            set.status = 400;
            return { message: usersResult.error };
        }
        const users = await enrichWithFileUrl(usersResult.result);
        return users;
    }, {
        requirePermission: PERMISSIONS.USUARIOS.VIEW
    })
    .post(`${path}`, async ({ body, set, headers, user }) => {
        const data = body as any;
        const lengthError = validateUserFieldLengths(data);
        if (lengthError) {
            set.status = 400;
            return { message: lengthError };
        }
        data.user_cr = (user as any).id;
        data.token_cr = (user as any).sid;

        // Parsear arrays de JSON (Elysia multipart puede enviar arrays como strings si vienen de FormData)
        if (typeof data.rol_sistema === 'string') data.rol_sistema = JSON.parse(data.rol_sistema);

        if (data.password) {
            data.password_hash = hashSync(data.password);
            delete data.password;
        }
        const result = await execProcedure('core.save_user', [data]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        // logAudit({ userId: (user as any).id, module: 'ADMIN', tableName: 'users', recordId: result.result?.id, action: 'INSERT', newData: result.result, ipAddress: extractClientIp(headers) });
        return enrichWithFileUrl(result.result);
    }, {
        requirePermission: PERMISSIONS.USUARIOS.CREATE,
        body: t.Object({
            first_name: t.String(),
            last_name: t.String(),
            email: t.String(),
            password: t.Optional(t.String()),
            phone: t.Optional(t.String()),
            dni: t.Optional(t.String()),
            cargo: t.Optional(t.String()),
            enable: t.Optional(t.Any()),
            status: t.Optional(t.Any()),
            rol_sistema: t.Optional(t.Any())
        })
    })
    .put(`${path}`, async ({ body, set, headers, user }) => {
        const data = body as any;
        const lengthError = validateUserFieldLengths(data);
        if (lengthError) {
            set.status = 400;
            return { message: lengthError };
        }
        data.user_cr = (user as any).id;
        data.token_cr = (user as any).sid;

        const isDelete = data.status === false || data.status === 'false';

        // Parsear campos complejos
        if (typeof data.rol_sistema === 'string') data.rol_sistema = JSON.parse(data.rol_sistema);

        // const oldData = await getOldDataForAudit('core.save_user', 'users', data.id);
        const result = await execProcedure('core.save_user', [data]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        // logAudit({ userId: (user as any).id, module: 'ADMIN', tableName: 'users', recordId: data.id, action: isDelete ? 'DELETE' : 'UPDATE', oldData, newData: result.result, ipAddress: extractClientIp(headers) });

        // Si se deshabilita el usuario, revocar sus sesiones (no solo el socket:
        // el access token seguiría siendo válido hasta expirar).
        if (data.enable === false || data.status === false || data.status === 'false') {
            const closed = await revokeUserSessions(Number(data.id), {
                reason: 'ADMIN',
                actorUserId: (user as any).id,
                actorSessionId: (user as any).sid,
            })
            closed.forEach(notifySessionClose)
            notifyUserClose(data.id)
        } else {
            notifyUserReload(data.id)
        }
        return enrichWithFileUrl(result.result);
    }, {
        requirePermission: PERMISSIONS.USUARIOS.EDIT,
        body: t.Object({
            id: t.Numeric(),
            first_name: t.Optional(t.String()),
            last_name: t.Optional(t.String()),
            email: t.Optional(t.String()),
            phone: t.Optional(t.String()),
            dni: t.Optional(t.String()),
            cargo: t.Optional(t.String()),
            enable: t.Optional(t.Any()),
            status: t.Optional(t.Any()),
            rol_sistema: t.Optional(t.Any())
        })
    })
    .get(`${path}/:id`, async ({ params: { id }, set, user }) => {
        const requester_id = (user as any).id;
        const result = await execProcedure('core.get_user_by_id', [{ id, requester_id }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        return enrichWithFileUrl(result.result);
    }, {
        requirePermission: PERMISSIONS.USUARIOS.VIEW
    })
    .post(`${path}/:id/foto`, async ({ params: { id }, body, set, headers, user }) => {
        const foto = (body as any).foto as File;
        if (!foto) {
            set.status = 400;
            return { message: 'Se requiere el campo "foto"' };
        }
        if (!FOTO_ALLOWED_MIME.includes(foto.type)) {
            set.status = 400;
            return { message: 'Solo se permiten imágenes JPEG, PNG o WebP' };
        }
        if (foto.size > FOTO_MAX_BYTES) {
            set.status = 400;
            return { message: 'La foto no puede superar los 5 MB' };
        }
        const { file: s3Key, filePath } = buildKeyObject(configServer.s3.paths.userAvatars, foto.name || 'foto.jpg');
        const uploaded = await uploadToS3Private(filePath, foto);
        if (!uploaded) {
            set.status = 500;
            return { message: 'No se pudo guardar la foto en el storage' };
        }
        // Usar el procedimiento dedicado para actualizar solo foto_url
        const updateResult = await execProcedure('core.update_user_foto', [{
            id: Number(id),
            foto_url: s3Key,
            user_cr: (user as any).id,
            token_cr: (user as any).sid,
        }]);
        if (updateResult.error) {
            set.status = 400;
            return { message: updateResult.error };
        }
        // Devolver URL firmada para uso inmediato en el frontend
        const foto_url = await getS3ObjectUrl(`${configServer.s3.paths.userAvatars}${s3Key}`);
        // logAudit({ userId: (user as any).id, module: 'ADMIN', tableName: 'users', recordId: Number(id), action: 'UPDATE', newData: { foto_updated: true }, ipAddress: extractClientIp(headers) });
        return { foto_url };
    }, {
        requirePermission: PERMISSIONS.USUARIOS.EDITAR_FOTO,
        body: t.Object({ foto: t.File() })
    })
    .delete(`${path}/:id/foto`, async ({ params: { id }, set, headers, user }) => {
        const result = await execProcedure('core.update_user_foto', [{
            id: Number(id),
            foto_url: null,
            user_cr: (user as any).id,
            token_cr: (user as any).sid,
        }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        // logAudit({ userId: (user as any).id, module: 'ADMIN', tableName: 'users', recordId: Number(id), action: 'UPDATE', newData: { foto_removed: true }, ipAddress: extractClientIp(headers) });
        return { success: true };
    }, {
        requirePermission: PERMISSIONS.USUARIOS.EDITAR_FOTO
    })
    .delete(`${path}/:id`, async ({ params: { id }, set, headers, user }) => {
        // const oldData = await getOldDataForAudit('core.delete_user', 'users', Number(id));
        const result = await execProcedure('core.delete_user', [{ id, user_cr: (user as any).id, token_cr: (user as any).sid }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        // logAudit({ userId: (user as any).id, module: 'ADMIN', tableName: 'users', recordId: Number(id), action: 'DELETE', oldData, ipAddress: extractClientIp(headers) });
        const closed = await revokeUserSessions(Number(id), {
            reason: 'ADMIN',
            actorUserId: (user as any).id,
            actorSessionId: (user as any).sid,
        })
        closed.forEach(notifySessionClose)
        notifyUserClose(id)
        return result.result;
    }, {
        requirePermission: PERMISSIONS.USUARIOS.DELETE
    })
    .put(`${path}/change-password`, async ({ body, set, headers, user }) => {
        const { id, password } = body as any;
        const password_hash = hashSync(password);
        // const oldData = await getOldDataForAudit('core.update_user_password', 'users', id);
        const result = await execProcedure('core.update_user_password', [{ id, password_hash, user_cr: (user as any).id, token_cr: (user as any).sid }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        // logAudit({ userId: (user as any).id, module: 'ADMIN', tableName: 'users', recordId: id, action: 'UPDATE', oldData, newData: { id, password_changed: true }, ipAddress: extractClientIp(headers) });
        const closed = await revokeUserSessions(Number(id), {
            reason: 'PASSWORD_CHANGE',
            actorUserId: (user as any).id,
            actorSessionId: (user as any).sid,
        })
        closed.forEach(notifySessionClose)
        notifyUserClose(id)
        return result.result;
    }, {
        requirePermission: PERMISSIONS.USUARIOS.EDIT
    });

