
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
import { userStore } from '@core/store';
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
    // Se decide al arrancar, no al construir (ver configServer.auth.cookieSecure).
    secure: configServer.auth.cookieSecure,
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
    roles: user.roles, // Informativo (UI y bitácora); la autorización no lo usa
    sid: sessionId,
});

// ── Límites ─────────────────────────────────────────────────────────────────

/** Largo máximo de una contraseña: hashear textos enormes solo gasta CPU. */
const PASSWORD_MAX = 128;
/** Fallos con la contraseña actual antes de cerrar la sesión, por ventana. */
const MAX_FALLOS_CONTRASENA = 5;
const VENTANA_FALLOS_CONTRASENA = 15 * 60;
/** Correos de recuperación por dirección, por ventana (lo que dura un código). */
const ENVIOS_RECUPERACION_MAX = 3;
const VENTANA_RECUPERACION = 15 * 60;

/**
 * Hash de una contraseña que nadie conoce, para comparar cuando el correo no
 * existe: así el login tarda lo mismo con o sin cuenta.
 */
let hashSenuelo: Promise<string> | null = null;
const getHashSenuelo = () => {
    hashSenuelo ??= Bun.password.hash(crypto.randomUUID());
    return hashSenuelo;
};

/**
 * Comprueba la contraseña actual en las rutas con sesión que la piden
 * (cambiar contraseña o correo). Devuelve `null` si es correcta, o el error a
 * responder. Cada fallo va a la bitácora y, al llegar al máximo, se cierra la
 * sesión: con un token robado no se puede probar contraseñas sin límite.
 * El hash se busca por id, no por el correo del token, que puede haber cambiado.
 */
const verificarContrasenaActual = async (
    user: any,
    password: string,
    headers: any,
    endpoint: string,
): Promise<{ code: 400 | 401; message: string } | null> => {
    const credentialsResult = await execProcedure('core.get_user_credentials', [{ id: user.id }]);
    const hash = credentialsResult.result?.password_hash;
    if (credentialsResult.error || !hash) {
        return { code: 400, message: 'No se pudo verificar la identidad del usuario' };
    }

    if (await Bun.password.verify(password, String(hash))) {
        await userStore.clearPasswordFailures(user.id);
        return null;
    }

    // `null` = Redis no respondió: el intento se registra pero no se corta.
    const fallos = await userStore.addPasswordFailure(user.id, VENTANA_FALLOS_CONTRASENA);
    await registrarEvento({
        entidad: 'users',
        operacion: 'LOGIN_FALLIDO',
        usuarioId: user.id,
        idRegistro: user.id,
        sesionId: user.sid,
        detalle: `Contraseña actual incorrecta (${fallos ?? '?'} de ${MAX_FALLOS_CONTRASENA})`,
        headers,
        endpoint,
    });

    if (fallos !== null && fallos >= MAX_FALLOS_CONTRASENA) {
        await revokeSession(user.sid, user.id, {
            reason: 'PASSWORD_ATTEMPTS',
            actorUserId: user.id,
            actorSessionId: user.sid,
        });
        notifySessionClose(user.sid);
        return {
            code: 401,
            message: 'Demasiados intentos con una contraseña incorrecta. Se cerró la sesión: vuelve a iniciarla.',
        };
    }

    // 400 y no 401: el frontend toma todo 401 por token vencido, renueva,
    // reintenta (otro fallo contado) y cierra la sesión.
    return { code: 400, message: 'La contraseña actual es incorrecta. Por favor, verifica tus datos.' };
};

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

        // Siempre se verifica un hash (el señuelo si no hay cuenta) y la
        // contraseña va antes que el estado: ni el tiempo ni el 403 revelan
        // qué cuentas existen.
        const credentials = credentialsResult.result
        const existe = !!(credentials?.id && credentials?.password_hash)
        const hash = existe ? String(credentials.password_hash) : await getHashSenuelo()
        const isPasswordValid = await Bun.password.verify(password, hash)

        if (!existe) {
            await loginFallido('No existe una cuenta activa con ese correo')
            return status(401, { message: 'Credenciales inválidas' })
        }

        if (!isPasswordValid) {
            await loginFallido('Contraseña incorrecta', credentials.id)
            return status(401, { message: 'Credenciales inválidas' })
        }

        // Solo quien sabe la contraseña llega a enterarse de que está inactiva.
        if (credentials.enable === false) {
            await loginFallido('Cuenta inactiva', credentials.id)
            return status(403, { message: 'Cuenta inactiva. Contacte al administrador.' })
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
            email: t.String({ maxLength: 150 }),
            password: t.String({ maxLength: PASSWORD_MAX }),
            ...captchaBodyField
        })
    })
    /**
     * Renueva el access token. NO exige access token válido (justamente se llama
     * cuando venció): la credencial es el refresh token, que se rota en cada uso.
     */
    .post(`${path}/refresh`, async ({ body, cookie, headers, status }) => {
        // La cookie viaja también desde dominios hermanos (SameSite=Lax): CORS
        // no deja leer la respuesta, pero la sesión se rotaría igual. Un
        // navegador siempre manda `Origin` en un POST; otros clientes, no.
        const origin = headers?.origin
        if (origin && !configServer.cors.isAllowed(origin)) {
            return status(403, { message: 'Origen no permitido' })
        }

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
            // Solo para comparar el correo y para el aviso; no se reenvían.
            const existingResult = await execProcedure('core.get_user_by_id', [{ id: (user as any).id }]);
            if (existingResult.error || !existingResult.result) {
                set.status = 400;
                return { message: existingResult.error || 'No se pudo obtener la información actual del usuario' };
            }

            const existingUser = existingResult.result as any;

            // El correo decide a dónde llegan los códigos de recuperación:
            // cambiarlo exige la contraseña actual.
            const { currentPassword, ...cambios } = body as any;
            const normalizarCorreo = (correo: unknown) => String(correo ?? '').trim().toLowerCase();
            const cambiaCorreo = cambios.email !== undefined
                && normalizarCorreo(cambios.email) !== normalizarCorreo(existingUser.email);

            if (cambiaCorreo) {
                if (!currentPassword) {
                    set.status = 400;
                    return { message: 'Confirma tu contraseña actual para cambiar el correo electrónico.' };
                }
                const fallo = await verificarContrasenaActual(user, currentPassword, headers, `PUT ${path}/update-profile`);
                if (fallo) {
                    set.status = fallo.code;
                    return { message: fallo.message };
                }
            }

            // Solo los campos de autoservicio: save_user conserva lo que no
            // viene, y así nunca se reescriben enable, status ni roles.
            const data: Record<string, unknown> = {
                id: (user as any).id, // siempre el propio perfil
                email: cambios.email,
                phone: cambios.phone || cambios.telefono || undefined,
                dni: cambios.dni,
                ...contextoAuditoria(user, headers, `PUT ${path}/update-profile`),
            };

            if (cambios.first_name !== undefined || cambios.last_name !== undefined) {
                data.first_name = cambios.first_name;
                data.last_name = cambios.last_name;
            } else if (cambios.names) {
                const parts = String(cambios.names).trim().split(/\s+/);
                data.first_name = parts[0] || '';
                data.last_name = parts.slice(1).join(' ') || '';
            }

            const result = await execProcedure('core.save_user', [data]);
            if (result.error) {
                set.status = 400;
                return { message: result.error };
            }

            // Aviso a la dirección anterior, sin bloquear la respuesta.
            if (cambiaCorreo) {
                emailService.sendEmailChangedNotice({
                    email: existingUser.email,
                    names: existingUser.names,
                    newEmail: result.result?.email ?? cambios.email,
                });
            }

            return result.result;
        }, {
            requirePermission: null,
            body: t.Object({
                // Obligatoria solo cuando cambia el correo.
                currentPassword: t.Optional(t.String({ maxLength: PASSWORD_MAX })),
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

            // 1. Validar la contraseña actual (con límite de intentos)
            const fallo = await verificarContrasenaActual(user, currentPassword, headers, `PUT ${path}/update-password`);
            if (fallo) {
                set.status = fallo.code;
                return { message: fallo.message };
            }

            // 2. Hashear y actualizar la nueva contraseña
            const password_hash = await Bun.password.hash(newPassword);

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
                currentPassword: t.String({ maxLength: PASSWORD_MAX }),
                newPassword: t.String({ minLength: 8, maxLength: PASSWORD_MAX })
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

    /**
     * Pide un código de recuperación. Responde siempre lo mismo y sin esperar
     * al SMTP, para no revelar qué correos tienen cuenta. Limitado a
     * ENVIOS_RECUPERACION_MAX por correo y ventana.
     */
    .post(`${path}/forgot-password`, async ({ body, status }) => {
        const { email } = body as { email: string };
        const respuesta = { message: 'Si el correo pertenece a una cuenta activa, te enviamos un código de recuperación.' };

        const correo = String(email).trim().toLowerCase();
        const envios = await userStore.incrementInWindow(`recovery:${correo}`, VENTANA_RECUPERACION);
        if (envios !== null && envios > ENVIOS_RECUPERACION_MAX) {
            return respuesta;
        }

        const result = await execProcedure('core.request_password_recovery', [{ email }]);
        if (result.error) {
            return status(500, { message: 'No se pudo procesar la solicitud en este momento. Por favor, intenta más tarde.' });
        }

        // Sin cuenta activa: misma respuesta, sin correo.
        if (result.result?.error) {
            return respuesta;
        }

        // Sin await (sendRecoveryCode nunca lanza; los fallos quedan en el log).
        const { recovery_code, names } = result.result;
        void emailService.sendRecoveryCode({ email, code: recovery_code, names, domain: configServer.domain });

        return respuesta;
    }, {
        requireCaptcha: true,
        body: t.Object({
            email: t.String({ maxLength: 150 }),
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

        // El código antes que el hash, que es lo caro. Un fallo cuenta como intento.
        const check = await execProcedure('core.validate_recovery_code', [{ email, recovery_code }]);
        if (check.error) {
            return status(500, { message: 'Error al restablecer la contraseña. Por favor, intenta más tarde.' });
        }
        if (check.result?.error) {
            return status(400, { message: 'Sesión de recuperación inválida o expirada' });
        }

        const password_hash = await Bun.password.hash(new_password);

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

        // El dueño del código, no el que resulte de buscar por correo.
        const userId = result.result?.user_id;

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
            new_password: t.String({ minLength: 8, maxLength: PASSWORD_MAX }),
            ...captchaBodyField
        })
    })
