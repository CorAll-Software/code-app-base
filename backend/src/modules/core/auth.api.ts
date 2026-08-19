
import { execProcedure } from '@core/db/connection';
import { extractToken, generateToken, validateToken } from "@core/jwt";
import { notifyUserClose } from '@modules/core/auth.ws';
import { userStore } from '@core/store';
import { logAudit, extractClientIp } from '@core/audit.helper';
import { emailService } from '@core/email/email-service';
import { getS3ObjectUrl } from '@core/s3';
import { Elysia, t } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { captchaPlugin, captchaBodyField } from '@core/captcha.guard';
import { configServer } from '@/config';

const signUserAvatar = async (user: any) => {
    if (user?.avatar) {
        user.avatar = await getS3ObjectUrl(`${configServer.s3.paths.userAvatars}${user.avatar}`) ?? user.avatar;
    }
    return user;
};

const { verifySync } = Bun.password

const path = '/auth'

export const AuthApi = new Elysia()
    .use(captchaPlugin)
    .post(`${path}/login`, async ({ body, status, cookie }) => {

        const { email, password } = body as { email: string, password: string };

        const credentialsResult = await execProcedure('core.get_user_credentials', [{ email }])
        if (credentialsResult.error) {
            return status(400, { message: credentialsResult.error })
        }

        const credentials = credentialsResult.result
        if (!credentials?.id || !credentials?.password_hash) {
            return status(401, { message: 'Credenciales inválidas' })
        }

        if (credentials.enable === false) {
            return status(403, { message: 'Cuenta inactiva. Contacte al administrador.' })
        }

        const storedPassword = String(credentials.password_hash)
        const isPasswordValid = verifySync(password, storedPassword)

        if (!isPasswordValid) {
            return status(401, { message: 'Credenciales inválidas' })
        }

        const userResult = await execProcedure('core.get_user_login_data', [{ id: credentials.id }])
        if (userResult.error) {
            return status(400, { message: userResult.error })
        }

        const user = await signUserAvatar(userResult.result)
        if (!user) {
            return status(401, { message: 'Credenciales inválidas' })
        }

        const token = generateToken({
            id: user.id,
            email: user.email,
            names: user.names,
            telefono: user.telefono,
            roles: user.roles // Se agregan los roles para el bypass de isAdmin
        })

        await userStore.addToken(token)
        await userStore.setUserPermissions(user.id, user.permisos || [])

        if (cookie && cookie.session_token) {
            cookie.session_token.set({
                value: token,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: configServer.auth.expiresIn
            });
        }

        return { user, token, expiresIn: configServer.auth.expiresIn }

    }, {
        requireCaptcha: true,
        body: t.Object({
            email: t.String(),
            password: t.String(),
            ...captchaBodyField
        })
    })
    .post(`${path}/logout`, async ({ headers, cookie }) => {
        const token = extractToken(headers, cookie);
        if (token) {
            userStore.removeToken(token); // En una implementación real, recibirías el token a invalidar desde el cliente
        }
        if (cookie && cookie.session_token) {
            cookie.session_token.remove();
        }
        // En una implementación real, podrías invalidar el token aquí (por ejemplo, agregándolo a una lista negra)
        return { message: 'Logout exitoso' }
    })
    .post(`${path}/verify-token`, async ({ headers, status, cookie }) => {
        const user = await validateToken(headers, cookie)
        if (user.error) { return status(401, { message: user.error }) };

        const userResult = await execProcedure('core.get_user_login_data', [{ id: user.id }])
        if (userResult.error) {
            return status(400, { message: userResult.error })
        }

        // No eliminar el token antiguo inmediatamente para evitar invalidar otras pestañas abiertas.
        // El token anterior expirará automáticamente en Redis según su tiempo de vida original.
        // const tokenAntiguo = extractToken(headers);
        // if (tokenAntiguo) {
        //     await userStore.removeToken(tokenAntiguo);
        // }

        const token = generateToken({
            id: userResult.result.id,
            email: userResult.result.email,
            names: userResult.result.names,
            telefono: userResult.result.telefono,
            roles: userResult.result.roles // Se agregan los roles para el bypass de isAdmin
        })

        await userStore.addToken(token)
        await userStore.setUserPermissions(userResult.result.id, userResult.result.permisos || [])

        if (cookie && cookie.session_token) {
            cookie.session_token.set({
                value: token,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: configServer.auth.expiresIn
            });
        }

        return { user: await signUserAvatar(userResult.result), token, expiresIn: configServer.auth.expiresIn }
    }, {
        headers: t.Object({
            authorization: t.String()
        })
    })
    .group(`${path}`, app => app
        .use(authPlugin)
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

            logAudit({
                userId: (user as any).id,
                module: 'ADMIN',
                tableName: 'users',
                recordId: (user as any).id,
                action: 'UPDATE',
                newData: body,
                ipAddress: extractClientIp(headers)
            });

            return result.result;
        }, {
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
            const isPasswordValid = verifySync(currentPassword, String(credentials.password_hash))

            if (!isPasswordValid) {
                set.status = 401
                return { message: 'La contraseña actual es incorrecta. Por favor, verifica tus datos.' }
            }

            // 2. Hashear y actualizar la nueva contraseña
            const password_hash = Bun.password.hashSync(newPassword);

            const result = await execProcedure('core.update_user_password', [{ id: (user as any).id, password_hash }]);
            if (result.error) {
                set.status = 400;
                return { message: result.error };
            }

            logAudit({
                userId: (user as any).id,
                module: 'ADMIN',
                tableName: 'users',
                recordId: (user as any).id,
                action: 'UPDATE',
                newData: { password_updated: true },
                ipAddress: extractClientIp(headers)
            });

            notifyUserClose((user as any).id, 'core')

            return { message: 'Contraseña actualizada correctamente' };
        }, {
            body: t.Object({
                currentPassword: t.String(),
                newPassword: t.String({ minLength: 8 })
            })
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
            password_hash
        }]);

        if (result.error) {
            return status(500, { message: 'Error al restablecer la contraseña. Por favor, intenta más tarde.' });
        }

        if (result.result?.error) {
            return status(400, { message: result.result.error });
        }

        logAudit({
            userId: 0, // System action (public endpoint)
            module: 'ADMIN',
            tableName: 'users',
            recordId: 0,
            action: 'UPDATE',
            newData: { password_reset: true, email },
            ipAddress: extractClientIp(headers)
        });

        const credentialsResult = await execProcedure('core.get_user_credentials', [{ email }]);
        if (credentialsResult.result?.id) {
            notifyUserClose(credentialsResult.result.id, 'core')
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
