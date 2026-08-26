import { execProcedure } from './db/connection';
import { userStore } from './store';

/*
    Caché de permisos efectivos por usuario.

    Mismo contrato que las sesiones (ver core/session.ts): Redis es la caché y
    core.get_user_permissions la fuente de verdad. Si la clave no está —Redis
    reiniciado, TTL vencido o invalidación por edición de un rol— se recarga
    desde BD en la propia petición, en vez de devolver 403 hasta que el usuario
    recargue la página.
*/

/**
 * Deja en caché una lista de permisos que el llamador ya tiene a mano (el
 * payload de `core.get_user_login_data` en login / refresh / verify-token).
 * Evita la consulta extra de `primeUserPermissions`.
 */
export const cacheUserPermissions = async (
    userId: number | string,
    permisos: string[] | null | undefined,
): Promise<void> => {
    await userStore.setUserPermissions(userId, permisos || []);
};

/** Lee los permisos del usuario desde BD y los deja en Redis. */
export const primeUserPermissions = async (userId: number | string): Promise<string[]> => {
    const { result, error } = await execProcedure('core.get_user_permissions', [{ user_id: userId }]);

    if (error) {
        console.error('[PERMISOS] No se pudieron cargar los permisos:', error);
        return [];
    }

    const permisos: string[] = result || [];
    await userStore.setUserPermissions(userId, permisos);
    return permisos;
};

/**
 * ¿El usuario tiene alguno de estos permisos? Con caché fría consulta BD y la
 * ceba; el resto de las veces resuelve contra Redis.
 */
export const userHasAnyPermission = async (
    userId: number | string,
    slugs: string[],
): Promise<boolean> => {
    if (!slugs.length) return false;

    if (!(await userStore.hasCachedPermissions(userId))) {
        const permisos = await primeUserPermissions(userId);
        return slugs.some(slug => permisos.includes(slug));
    }

    for (const slug of slugs) {
        if (await userStore.hasPermission(userId, slug as any)) return true;
    }
    return false;
};

/**
 * Invalida la caché de varios usuarios. Es un DEL por usuario: la recarga es
 * perezosa, así que invalidar de más no cuesta consultas de más.
 */
export const invalidateUsersPermissions = async (userIds: (number | string)[]): Promise<void> => {
    await Promise.all(userIds.map(id => userStore.clearUserPermissions(id)));
};

/** Ids de los usuarios que tienen asignado un rol. */
export const listUsersByRole = async (roleId: number | string): Promise<number[]> => {
    const { result, error } = await execProcedure('core.list_users_by_role', [{ role_id: roleId }]);
    if (error) {
        console.error('[PERMISOS] No se pudieron listar los usuarios del rol:', error);
        return [];
    }
    return (result || []) as number[];
};
