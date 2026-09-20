
import { execProcedure } from '@core/db/connection';
import { extractRefreshToken, extractToken, generateAccessToken, verifyToken } from "@core/jwt";
import { notifySessionClose, notifyUserClose } from '@modules/core/auth.ws';
import {
    createSession,
    listSessions,
    revokeSession,
    revokeUserSessions,
    rotateSession,
} from '@core/session';
import { cacheUserPermissions } from '@core/permissions';
import { contextoAuditoria, registrarEvento, trazas } from '@core/auditoria';
import { emailService } from '@core/email/email-service';
import { getS3ObjectUrl } from '@core/s3';
import { Elysia, t } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { captchaPlugin, captchaBodyField } from '@core/captcha.guard';
import { configServer } from '@/config';

const { accessExpiresIn, refreshExpiresIn } = configServer.auth;

const signUserAvatar = async (user: any) => {
    if (user?.avatar) {
        user.avatar = await getS3ObjectUrl(`${configServer.s3.paths.userAvatars}${user.avatar}`) ?? user.avatar;
    }
    return user;
};

const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};

/**
 * Deja el par de cookies httpOnly de la sesión. El frontend usa la cabecera
 * Authorization (ver core/http.ts); las cookies son el respaldo para clientes
 * que no manejan el header y para que el refresh sobreviva a un F5.
 */
const setSessionCookies = (cookie: any, token: string, refreshToken: string) => {
    if (cookie?.session_token) {
        cookie.session_token.set({ ...cookieBase, value: token, maxAge: accessExpiresIn });
    }
    if (cookie?.refresh_token) {
        cookie.refresh_token.set({ ...cookieBase, value: refreshToken, maxAge: refreshExpiresIn });
    }
};

const clearSessionCookies = (cookie: any) => {
    if (cookie?.session_token) cookie.session_token.remove();
    if (cookie?.refresh_token) cookie.refresh_token.remove();
};

/** Construye el access token a partir de los datos de login y la sesión. */
const buildAccessToken = (user: any, sessionId: string) => generateAccessToken({
    id: user.id,
    email: user.email,
    names: user.names,
    telefono: user.telefono,
    roles: user.roles, // Se agregan los roles para el bypass de isAdmin
    sid: sessionId,
});

const path = '/auth'

export const AuthApi = new Elysia()
    .use(captchaPlugin)
    .post(`${path}/login`, async ({ body, status, cookie, headers }) => {

        const { email, password } = body as { email: string, password: string };

        const credentialsResult = await execProcedure('core.get_user_credentials', [{ email }])
        if (credentialsResult.error) {
            return status(400, { message: credentialsResult.error })
        }

        // Un intento fallido no llega a tocar ninguna fila, así que ningún
        // trigger lo ve: se registra explícitamente. Es de los eventos más
        // útiles de la bitácora — una ráfaga de LOGIN_FALLIDO contra la misma
        // cuenta o desde la misma ip es lo que delata un ataque de fuerza bruta.
        // El motivo va en el detalle (uso interno); la respuesta HTTP sigue
        // siendo la misma para no revelar si el correo existe.
        const loginFallido = (detalle: string, usuarioId?: number | null) => registrarEvento({
            entidad: 'users',
            operacion: 'LOGIN_FALLIDO',
            usuarioId: usuarioId ?? null,
            idRegistro: usuarioId != null ? String(usuarioId) : null,
            detalle: `${detalle} · correo: ${email}`,
            headers,
            endpoint: `POST ${path}/login`,
        })

        const credentials = credentialsResult.result
        if (!credentials?.id || !credentials?.password_hash) {
            await loginFallido('No existe una cuenta activa con ese correo')
            return status(401, { message: 'Credenciales inválidas' })
        }

        if (credentials.enable === false) {
            await loginFallido('Cuenta inactiva', credentials.id)
            return status(403, { message: 'Cuenta inactiva. Contacte al administrador.' })
        }

        const storedPassword = String(credentials.password_hash)
        const isPasswordValid = Bun.password.verifySync(password, storedPassword)

        if (!isPasswordValid) {
            await loginFallido('Contraseña incorrecta', credentials.id)
            return status(401, { message: 'Credenciales inválidas' })
        }

        const userResult = await execProcedure('core.get_user_login_data', [{ id: credentials.id, touch_login: true }])
        if (userResult.error) {
            return status(400, { message: userResult.error })
        }

        const user = await signUserAvatar(userResult.result)
        if (!user) {
            return status(401, { message: 'Credenciales inválidas' })
        }

        const created = await createSession(user.id, {
            ip: trazas(headers).ip ?? undefined,
            userAgent: headers?.['user-agent'],
            endpoint: `POST ${path}/login`,
        })
        if ('error' in created) {
            return status(500, { message: created.error })
        }

        const token = buildAccessToken(user, created.session.id)
        await cacheUserPermissions(user.id, user.permisos)

        setSessionCookies(cookie, token, created.refreshToken)

        return {
            user,
            token,
            refreshToken: created.refreshToken,
            expiresIn: accessExpiresIn,
            refreshExpiresIn,
        }

    }, {
        requireCaptcha: true,
        body: t.Object({
            email: t.String(),
            password: t.String(),
            ...captchaBodyField
        })
    })
    /**
     * Renueva el access token. NO exige access token válido (justamente se llama
     * cuando venció): la credencial es el refresh token, que se rota en cada uso.
     */
    .post(`${path}/refresh`, async ({ body, cookie, headers, status }) => {
        const refreshToken = extractRefreshToken(body, cookie)
        if (!refreshToken) {
            return status(401, { message: 'No se ha enviado el refresh token' })
        }

        const rotated = await rotateSession(refreshToken, {
            ip: trazas(headers).ip ?? undefined,
            userAgent: headers?.['user-agent'],
        })

        if ('error' in rotated) {
            clearSessionCookies(cookie)
            return status(401, { message: rotated.error })
        }

        const userResult = await execProcedure('core.get_user_login_data', [{ id: rotated.userId }])
        if (userResult.error) {
            // El usuario ya no puede operar (inactivo, sin roles): cerrar la sesión.
            await revokeSession(rotated.sessionId, rotated.userId, { reason: 'ADMIN' })
            clearSessionCookies(cookie)
            return status(401, { message: userResult.error })
        }

        const user = await signUserAvatar(userResult.result)
        const token = buildAccessToken(user, rotated.sessionId)
        await cacheUserPermissions(user.id, user.permisos)

        setSessionCookies(cookie, token, rotated.refreshToken)

        return {
            user,
            token,
            refreshToken: rotated.refreshToken,
            expiresIn: accessExpiresIn,
            refreshExpiresIn,
        }
    }, {
        body: t.Optional(t.Object({
            refreshToken: t.Optional(t.String())
        }))
    })
    /**
     * Cierra la sesión actual. Es público a propósito: si el access token ya
     * venció el usuario igual debe poder cerrar sesión, y para eso se cae al
     * refresh token (canjearlo prueba la posesión de la sesión).
     */
    .post(`${path}/logout`, async ({ body, headers, cookie }) => {
        const token = extractToken(headers, cookie);
        const claims = token ? verifyToken(token) : null;

        let session = claims?.sid && claims?.id
            ? { sessionId: claims.sid as string, userId: claims.id as number }
            : null;

        if (!session) {
            const refreshToken = extractRefreshToken(body, cookie);
            const rotated = refreshToken ? await rotateSession(refreshToken) : null;
            if (rotated && !('error' in rotated)) {
                session = { sessionId: rotated.sessionId, userId: rotated.userId };
            }
        }

        if (session) {
            await revokeSession(session.sessionId, session.userId, {
                reason: 'LOGOUT',
                actorUserId: session.userId,
                actorSessionId: session.sessionId,
            });
            notifySessionClose(session.sessionId);
        }

        clearSessionCookies(cookie);
        return { message: 'Logout exitoso' }
    }, {
        body: t.Optional(t.Object({
            refreshToken: t.Optional(t.String())
        }))
    })
    .group(`${path}`, app => app
        .use(authPlugin)
        /**
         * Revalida la sesión y devuelve los datos frescos del usuario (permisos,
         * roles, avatar). NO emite tokens: para eso está /auth/refresh.
         */
        .post(`/verify-token`, async ({ status, user }) => {
            const userResult = await execProcedure('core.get_user_login_data', [{ id: (user as any).id }])
            if (userResult.error) {
                return status(400, { message: userResult.error })
            }

            await cacheUserPermissions(userResult.result.id, userResult.result.permisos)

            return { user: await signUserAvatar(userResult.result), expiresIn: accessExpiresIn }
        }, {
            requirePermission: null
        })
        .put(`/update-profile`, async ({ body, headers, set, user }) => {
            // Retrieve existing user data to avoid overwriting missing fields with NULL
            const existingResult = await execProcedure('core.get_user_by_id', [{ id: (user as any).id }]);
            if (existingResult.error || !existingResult.result) {
                set.status = 400;
                return { message: existingResult.error || 'No se pudo obtener la información actual del usuario' };
            }

            const existingUser = existingResult.result as any;
            const data = { ...existingUser, ...(body as any) };
            data.id = (user as any).id; // Force updating own profile
            Object.assign(data, contextoAuditoria(user, headers, `PUT ${path}/update-profile`));

            // Synchronize first_name/last_name/names
            const bodyAny = body as any;
            if (bodyAny.names && !bodyAny.first_name) {
                const parts = bodyAny.names.trim().split(/\s+/);
                data.first_name = parts[0] || '';
                data.last_name = parts.slice(1).join(' ') || '';
                data.names = bodyAny.names;
            } else if (!bodyAny.names && (bodyAny.first_name || bodyAny.last_name)) {
                data.first_name = bodyAny.first_name ?? data.first_name;
                data.last_name = bodyAny.last_name ?? data.last_name;
                data.names = `${data.first_name || ''} ${data.last_name || ''}`.trim();
            }

            // Ensure phone and telefono are synchronized
            data.telefono = (body as any).phone || (body as any).telefono || data.telefono;
            data.phone = data.telefono;

            const result = await execProcedure('core.save_user', [data]);
            if (result.error) {
                set.status = 400;
                return { message: result.error };
            }


            return result.result;
        }, {
            requirePermission: null,
            body: t.Object({
                names: t.Optional(t.String()),
                first_name: t.Optional(t.String()),
                last_name: t.Optional(t.String()),
                email: t.Optional(t.String()),
                telefono: t.Optional(t.Nullable(t.String())),
                phone: t.Optional(t.Nullable(t.String())),
                dni: t.Optional(t.Nullable(t.String())),
                numero_documento: t.Optional(t.Nullable(t.String())),
            })
        })
        .put(`/update-password`, async ({ body, headers, set, user }) => {
            const { currentPassword, newPassword } = body as { currentPassword: string, newPassword: string };

            // 1. Validar la contraseña actual
            const credentialsResult = await execProcedure('core.get_user_credentials', [{ email: (user as any).email }])
            if (credentialsResult.error || !credentialsResult.result) {
                set.status = 400
                return { message: 'No se pudo verificar la identidad del usuario' }
            }

            const credentials = credentialsResult.result
            const isPasswordValid = Bun.password.verifySync(currentPassword, String(credentials.password_hash))

            if (!isPasswordValid) {
                set.status = 401
                return { message: 'La contraseña actual es incorrecta. Por favor, verifica tus datos.' }
            }

            // 2. Hashear y actualizar la nueva contraseña
            const password_hash = Bun.password.hashSync(newPassword);

            const result = await execProcedure('core.update_user_password', [{
                id: (user as any).id,
                password_hash,
                ...contextoAuditoria(user, headers, `PUT ${path}/update-password`),
            }]);
            if (result.error) {
                set.status = 400;
                return { message: result.error };
            }


            // 3. Cerrar el resto de dispositivos: la sesión actual sobrevive para
            //    que quien cambió la contraseña no se quede fuera.
            const closed = await revokeUserSessions((user as any).id, {
                reason: 'PASSWORD_CHANGE',
                exceptId: (user as any).sid,
                actorUserId: (user as any).id,
                actorSessionId: (user as any).sid,
            });
            closed.forEach(notifySessionClose);

            return { message: 'Contraseña actualizada correctamente', closedSessions: closed.length };
        }, {
            requirePermission: null,
            body: t.Object({
                currentPassword: t.String(),
                newPassword: t.String({ minLength: 8 })
            })
        })
        /** Sesiones activas del usuario; `current: true` marca la de este token. */
        .get(`/sessions`, async ({ user }) => {
            const sessions = await listSessions((user as any).id);
            return sessions.map((s) => ({ ...s, current: s.id === (user as any).sid }));
        }, {
            requirePermission: null
        })
        .delete(`/sessions/:id`, async ({ params, set, user }) => {
            const sessionId = params.id;

            const revoked = await revokeSession(sessionId, (user as any).id, {
                reason: sessionId === (user as any).sid ? 'LOGOUT' : 'MANUAL',
                actorUserId: (user as any).id,
                actorSessionId: (user as any).sid,
            });
            if ('error' in revoked) {
                set.status = 400;
                return { message: revoked.error };
            }

            notifySessionClose(sessionId);


            return { message: 'Sesión cerrada' };
        }, {
            requirePermission: null
        })
        /** Cierra todas las sesiones menos la actual. */
        .delete(`/sessions`, async ({ user }) => {
            const closed = await revokeUserSessions((user as any).id, {
                reason: 'MANUAL',
                exceptId: (user as any).sid,
                actorUserId: (user as any).id,
                actorSessionId: (user as any).sid,
            });
            closed.forEach(notifySessionClose);


            return { message: 'Se cerraron las demás sesiones', closedSessions: closed.length };
        }, {
            requirePermission: null
        })
    )

    .post(`${path}/forgot-password`, async ({ body, status }) => {
        const { email } = body as { email: string };
        const result = await execProcedure('core.request_password_recovery', [{ email }]);

        if (result.error) {
            return status(500, { message: 'No se pudo procesar la solicitud en este momento. Por favor, intenta más tarde.' });
        }

        if (result.result?.error) {
            return status(400, { message: result.result.error });
        }

        const { recovery_code, names } = result.result;
        const sent = await emailService.sendRecoveryCode({ email, code: recovery_code, names, domain: configServer.domain });

        if (!sent) {
            return status(500, { message: 'Error al enviar el código de recuperación por correo.' });
        }

        return { message: 'Código de recuperación enviado' };
    }, {
        requireCaptcha: true,
        body: t.Object({
            email: t.String(),
            ...captchaBodyField
        })
    })
    .post(`${path}/validate-recovery-code`, async ({ body, status }) => {
        const result = await execProcedure('core.validate_recovery_code', [body]);

        if (result.error) {
            return status(500, { message: 'Error de validación. Por favor, intenta más tarde.' });
        }

        if (result.result?.error) {
            return status(400, { message: result.result.error });
        }

        return { message: 'Código válido' };
    }, {
        requireCaptcha: true,
        body: t.Object({
            email: t.String(),
            recovery_code: t.String({ minLength: 6, maxLength: 6 }),
            ...captchaBodyField
        })
    })
    .post(`${path}/reset-password`, async ({ body, status, headers }) => {
        const { email, recovery_code, new_password } = body as any;
        const password_hash = Bun.password.hashSync(new_password);

        const result = await execProcedure('core.reset_password_with_code', [{
            email,
            recovery_code,
            password_hash,
            // Flujo público: no hay sesión ni usuario todavía, pero las trazas
            // de red sí sirven. El autor lo resuelve la propia función SQL al
            // validar el código (ver core/password_recovery_module.sql).
            endpoint: `POST ${path}/reset-password`,
            ...trazas(headers),
        }]);

        if (result.error) {
            return status(500, { message: 'Error al restablecer la contraseña. Por favor, intenta más tarde.' });
        }

        if (result.result?.error) {
            return status(400, { message: result.result.error });
        }

        const credentialsResult = await execProcedure('core.get_user_credentials', [{ email }]);
        const userId = credentialsResult.result?.id;


        if (userId) {
            // Restablecer contraseña cierra TODAS las sesiones: quien la pidió
            // no tiene ninguna sesión de confianza que preservar.
            // Sin actor: el flujo es público, quien lo pidió no tiene sesión.
            await revokeUserSessions(userId, { reason: 'PASSWORD_CHANGE' });
            notifyUserClose(userId);
        }

        return { message: 'Contraseña restablecida exitosamente' };
    }, {
        requireCaptcha: true,
        body: t.Object({
            email: t.String(),
            recovery_code: t.String({ minLength: 6, maxLength: 6 }),
            new_password: t.String({ minLength: 8 }),
            ...captchaBodyField
        })
    })
