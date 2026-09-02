import { Elysia } from 'elysia';
import { validateToken } from '@core/jwt';
import { userHasAnyPermission } from '@core/permissions';
import { PermisoSlug } from '@core/permisos.type';
import { registrarEvento } from '@core/auditoria';

/**
 * Plugin de autenticación y autorización.
 *
 * Toda instancia que haga `.use(authPlugin)` queda protegida: el
 * `onBeforeHandle` de abajo exige un token válido en TODAS sus rutas, declaren
 * o no `requirePermission`. Es deliberadamente "fail-closed" — olvidar la macro
 * en una ruta la dejaba completamente pública, que es un error fácil de cometer
 * y difícil de notar.
 *
 * El scope `scoped` hace que la protección alcance a la instancia que usa el
 * plugin (y al grupo donde se monta) sin escaparse al resto de la app: las
 * rutas públicas de `auth.api.ts` (login, forgot-password) siguen abiertas
 * porque viven fuera del grupo que usa este plugin.
 */
export const authPlugin = new Elysia({ name: 'auth-plugin' })
    .derive({ as: 'global' }, async ({ headers, cookie }) => {
        const user = await validateToken(headers, cookie);
        return { user };
    })
    .onBeforeHandle({ as: 'scoped' }, ({ user, status }) => {
        // Identidad base: token presente, firmado y con la sesión aún activa.
        if ((user as any)?.error) {
            return status(401, { message: (user as any).error });
        }
    })
    .macro({
        // `null` = solo exige token válido (sin permiso específico).
        requirePermission(value: PermisoSlug | PermisoSlug[] | null) {
            return {
                async beforeHandle({ user, status, headers, request, path }) {
                    // 1. Validar identidad base (Token válido)
                    if (user?.error) {
                        return status(401, { message: user.error });
                    }

                    // 2. Si el valor es null o undefined, no hacemos nada
                    if (!value) return;

                    // 3. Superusuario (Rol Administrador o ID 1) pasa cualquier restricción
                    if (user?.isAdmin) return;

                    // 4. Permisos: Redis primero, BD si la caché está fría
                    const permissions = (Array.isArray(value) ? value : [value]) as string[];
                    const hasAccess = await userHasAnyPermission(user.id, permissions);

                    // 5. Bloqueo si no tiene el privilegio exacto
                    if (!hasAccess) {
                        // Un intento denegado no toca ninguna fila, así que
                        // ningún trigger lo ve. Es justo el evento que hay que
                        // conservar: alguien con sesión válida pidiendo algo
                        // que no le corresponde. Se registra ANTES de responder
                        // para que no se pierda si el cliente corta.
                        await registrarEvento({
                            entidad: 'permissions',
                            operacion: 'ACCESO_DENEGADO',
                            usuarioId: user.id,
                            sesionId: user.sid,
                            detalle: `Permiso requerido: ${permissions.join(' o ')}`,
                            headers,
                            endpoint: `${request.method} ${path}`,
                        });
                        return status(403, { message: 'No tienes los permisos necesarios para realizar esta acción' });
                    }
                }
            }
        }
    });
