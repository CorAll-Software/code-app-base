-- =============================================================================
-- SEED: core.permissions — Catálogo de permisos del sistema
-- Fuente de verdad de los slugs. Debe mantenerse sincronizado con:
--   · backend/src/core/permissions.constants.ts
--   · frontend/src/core/permissions.constants.ts
--
-- Idempotente: re-ejecutable (ON CONFLICT por slug). Al agregar un módulo de
-- negocio, anexa sus permisos con el formato `modulo.accion`.
-- =============================================================================

INSERT INTO core.permissions (name, slug, description) VALUES
    -- ── Núcleo · Identidad, Accesos y Seguridad ──────────────────────────────
    ('Ver usuarios',                  'usuarios.view',                 'Ver usuarios del sistema'),
    ('Ver todos los usuarios',        'usuarios.view_all',             'Ver usuarios de todas las áreas/roles'),
    ('Crear usuario',                 'usuarios.create',               'Crear usuarios'),
    ('Editar usuario',                'usuarios.edit',                 'Editar usuarios'),
    ('Eliminar usuario',              'usuarios.delete',               'Eliminar (soft-delete) usuarios'),
    ('Editar foto de usuario',        'usuarios.editar_foto',          'Cambiar la foto de perfil de un usuario'),
    ('Ver roles',                     'roles.view',                    'Ver roles y sus permisos'),
    ('Gestionar roles',               'roles.manage',                  'Crear/editar roles y asignar permisos'),
    ('Ver auditoría',                 'auditoria.view',                'Consultar la bitácora de auditoría')
ON CONFLICT (slug) DO UPDATE
    SET name        = EXCLUDED.name,
        description = EXCLUDED.description,
        status      = TRUE,
        date_up     = EXTRACT(EPOCH FROM NOW())::BIGINT;
