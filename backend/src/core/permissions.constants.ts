/**
 * Diccionario central de permisos para evitar el uso de strings "mágicos".
 *
 * IMPORTANTE: este archivo debe mantenerse sincronizado con:
 *   · frontend/src/core/permissions.constants.ts (gemelo)
 *   · postgres/core/seed-permissions.sql (fuente de los slugs en BD)
 *
 * Al agregar un módulo de negocio, añade aquí su bloque con el formato
 * `modulo.accion` (p.ej. CLIENTES: { VIEW: 'clientes.view', ... }).
 */
export const PERMISSIONS = {
    // ── Núcleo · Identidad, Accesos y Seguridad ──────────────────────────────
    USUARIOS: {
        VIEW: 'usuarios.view',
        VIEW_ALL: 'usuarios.view_all',
        CREATE: 'usuarios.create',
        EDIT: 'usuarios.edit',
        DELETE: 'usuarios.delete',
        EDITAR_FOTO: 'usuarios.editar_foto',
    },
    ROLES: {
        VIEW: 'roles.view',
        MANAGE: 'roles.manage',
    },
    AUDITORIA: {
        VIEW: 'auditoria.view',
    },
} as const;

export const SYSTEM_ROLES = {
    ADMIN: 'Administrador',
} as const;
