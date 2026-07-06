import { Elysia, t } from 'elysia';
import { validateToken } from '@core/jwt';
import { userStore } from '@core/store';
import { PermisoSlug } from '@core/permisos.type';

export const authPlugin = new Elysia({ name: 'auth-plugin' })
    .derive({ as: 'global' }, async ({ headers, cookie }) => {
        const user = await validateToken(headers, cookie);
        return { user };
    })
    .macro({
        // `null` = solo exige token válido (sin permiso específico).
        requirePermission(value: PermisoSlug | PermisoSlug[] | null) {
            return {
                async beforeHandle({ user, status }) {
                    // 1. Validar identidad base (Token válido)
                    if (user?.error) {
                        return status(401, { message: user.error });
                    }

                    // 2. Si el valor es null o undefined, no hacemos nada
                    if (!value) return;

                    // 3. Superusuario (Rol Administrador o ID 1) pasa cualquier restricción
                    if (user?.isAdmin) return;

                    // 4. Verificación Atómica de Permisos contra Redis
                    const permissions = Array.isArray(value) 
                        ? value 
                        : [value];
                    
                    let hasAccess = false;
                    for (const permissionString of permissions as string[]) {
                        if (await userStore.hasPermission(user.id, permissionString as any)) {
                            hasAccess = true;
                            break;
                        }
                    }

                    // 5. Bloqueo si no tiene el privilegio exacto
                    if (!hasAccess) {
                        return status(403, { message: 'No tienes los permisos necesarios para realizar esta acción' });
                    }
                }
            }
        }
    });



