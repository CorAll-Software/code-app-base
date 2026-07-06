import { PERMISSIONS } from './permissions.constants';

/**
 * Tipado dinámico para permisos basados en el objeto PERMISSIONS.
 * No editar manualmente la unión de strings.
 */
type DeepValue<T> = T extends string
    ? T
    : T extends object
    ? { [K in keyof T]: DeepValue<T[K]> }[keyof T]
    : never;

export type PermisoSlug = DeepValue<typeof PERMISSIONS> | (string & {});
