import { execProcedure } from '@core/db/connection';
import { notifySessionClose, notifyUserClose, notifyUserReload } from '@modules/core/auth.ws';
import { revokeUserSessions } from '@core/session';
import { invalidateUsersPermissions } from '@core/permissions';
import { contextoAuditoria } from '@core/auditoria';
import { Elysia, t } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { PERMISSIONS } from '@core/permissions.constants';
import { buildKeyObject, getS3ObjectUrl, uploadToS3Private } from '@core/s3';
import { configServer } from '@/config';

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
const FOTO_EXTENSION: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

/**
 * Tipo real de la imagen según sus primeros bytes, o `null` si no es JPEG, PNG
 * ni WebP. El `type` del multipart lo declara el cliente y no prueba nada: con
 * él solo, se podía subir HTML declarado como image/png y llamado `a.html`.
 */
async function detectarTipoImagen(file: File): Promise<string | null> {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const ascii = (desde: number, hasta: number) => String.fromCharCode(...b.slice(desde, hasta));
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
    if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
    return null;
}

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

// `save_user` hace `(req->>'enable')::BOOLEAN` y lo mismo con `status`, que
// también aceptan texto ("false", "f", "0"...). Se normalizan aquí a booleano
// antes de llamar al SP para que la base y el cierre de sesiones decidan con el
// mismo valor: si no, un "f" deshabilitaría al usuario sin revocar sus sesiones.
// `undefined` = no viene; `null` = viene pero no se reconoce.
function parseBool(v: unknown): boolean | null | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    if (['true', 't', '1', 'yes', 'y', 'on'].includes(s)) return true;
    if (['false', 'f', '0', 'no', 'n', 'off'].includes(s)) return false;
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
        // Endpoint ligero para selectores de asignación: cualquier usuario
        // autenticado puede usarlo, así que solo devuelve id, nombre y cargo.
        // Antes devolvía lo mismo que GET /users (correo, teléfono, DNI, roles)
        // sin pedir usuarios.view.
        const usersResult = await execProcedure('core.get_users_combo', [{}]);
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
        // `user_cr`/`token_cr` (columnas de auditoría de fila) + quién, desde
        // dónde y por qué ruta, para los triggers de auditoría. La bitácora la
        // escribe la base sola: aquí no se llama a nada más.
        Object.assign(data, contextoAuditoria(user, headers, `POST ${path}`));

        // Parsear arrays de JSON (Elysia multipart puede enviar arrays como strings si vienen de FormData)
        if (typeof data.rol_sistema === 'string') data.rol_sistema = JSON.parse(data.rol_sistema);

        if (data.password) {
            data.password_hash = await Bun.password.hash(data.password);
            delete data.password;
        }
        const result = await execProcedure('core.save_user', [data]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        return enrichWithFileUrl(result.result);
    }, {
        requirePermission: PERMISSIONS.USUARIOS.CREATE,
        body: t.Object({
            first_name: t.String(),
            last_name: t.String(),
            email: t.String(),
            password: t.Optional(t.String({ minLength: 8, maxLength: 128 })),
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
        Object.assign(data, contextoAuditoria(user, headers, `PUT ${path}`));

        for (const campo of ['enable', 'status'] as const) {
            const valor = parseBool(data[campo]);
            if (valor === null) {
                set.status = 400;
                return { message: `Valor de ${campo} no válido` };
            }
            data[campo] = valor;
        }

        // Parsear campos complejos
        if (typeof data.rol_sistema === 'string') data.rol_sistema = JSON.parse(data.rol_sistema);

        const result = await execProcedure('core.save_user', [data]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }

        // Si se deshabilita el usuario, revocar sus sesiones (no solo el socket:
        // el access token seguiría siendo válido hasta expirar).
        if (data.enable === false || data.status === false) {
            const closed = await revokeUserSessions(Number(data.id), {
                reason: 'ADMIN',
                actorUserId: (user as any).id,
                actorSessionId: (user as any).sid,
            })
            closed.forEach(notifySessionClose)
            notifyUserClose(data.id)
        } else {
            // Puede haber cambiado `rol_sistema`: la caché de permisos ya no vale.
            await invalidateUsersPermissions([data.id])
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
        if (foto.size > FOTO_MAX_BYTES) {
            set.status = 400;
            return { message: 'La foto no puede superar los 5 MB' };
        }
        // El tipo sale del contenido, no de lo que declara el cliente, y de él
        // salen la extensión de la clave y el Content-Type guardado. El nombre
        // del archivo original ya no interviene.
        const tipo = await detectarTipoImagen(foto);
        if (!tipo || !FOTO_ALLOWED_MIME.includes(tipo)) {
            set.status = 400;
            return { message: 'Solo se permiten imágenes JPEG, PNG o WebP' };
        }
        const { file: s3Key, filePath } = buildKeyObject(configServer.s3.paths.userAvatars, `foto.${FOTO_EXTENSION[tipo]}`);
        const uploaded = await uploadToS3Private(filePath, foto, tipo);
        if (!uploaded) {
            set.status = 500;
            return { message: 'No se pudo guardar la foto en el storage' };
        }
        // Usar el procedimiento dedicado para actualizar solo foto_url
        const updateResult = await execProcedure('core.update_user_foto', [{
            id: Number(id),
            foto_url: s3Key,
            ...contextoAuditoria(user, headers, `POST ${path}/:id/foto`),
        }]);
        if (updateResult.error) {
            set.status = 400;
            return { message: updateResult.error };
        }
        // Devolver URL firmada para uso inmediato en el frontend
        const foto_url = await getS3ObjectUrl(`${configServer.s3.paths.userAvatars}${s3Key}`);
        return { foto_url };
    }, {
        requirePermission: PERMISSIONS.USUARIOS.EDITAR_FOTO,
        body: t.Object({ foto: t.File() })
    })
    .delete(`${path}/:id/foto`, async ({ params: { id }, set, headers, user }) => {
        const result = await execProcedure('core.update_user_foto', [{
            id: Number(id),
            foto_url: null,
            ...contextoAuditoria(user, headers, `DELETE ${path}/:id/foto`),
        }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        return { success: true };
    }, {
        requirePermission: PERMISSIONS.USUARIOS.EDITAR_FOTO
    })
    .delete(`${path}/:id`, async ({ params: { id }, set, headers, user }) => {
        const result = await execProcedure('core.delete_user', [{
            id,
            ...contextoAuditoria(user, headers, `DELETE ${path}/:id`),
        }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
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
        const password_hash = await Bun.password.hash(password);
        const result = await execProcedure('core.update_user_password', [{
            id,
            password_hash,
            ...contextoAuditoria(user, headers, `PUT ${path}/change-password`),
        }]);
        if (result.error) {
            set.status = 400;
            return { message: result.error };
        }
        const closed = await revokeUserSessions(Number(id), {
            reason: 'PASSWORD_CHANGE',
            actorUserId: (user as any).id,
            actorSessionId: (user as any).sid,
        })
        closed.forEach(notifySessionClose)
        notifyUserClose(id)
        return result.result;
    }, {
        requirePermission: PERMISSIONS.USUARIOS.EDIT,
        // Sin esquema, un body sin `password` reventaba en el hash con un 500.
        body: t.Object({
            id: t.Numeric(),
            password: t.String({ minLength: 8, maxLength: 128 }),
        })
    });
