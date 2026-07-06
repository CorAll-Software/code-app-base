-- =============================================================================
-- ESQUEMA: core — Identidad, accesos, auditoría y notificaciones (BASE)
-- DDL del esquema. Espejo de core/core-tables.dbml.
-- core no depende de otros esquemas: es la base de toda la BD.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS core;

-- ── ENUMs ────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE core.enum_audit_action AS ENUM ('INSERT', 'UPDATE', 'DELETE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Módulos del sistema. Al crear un módulo de negocio, agrega su valor aquí
-- (ALTER TYPE core.enum_module ADD VALUE 'MI_MODULO';) y sincroniza:
--   · backend/src/core/audit.helper.ts (AuditModule)
--   · frontend/src/modules/configuracion/services/audit.service.ts (AuditModule)
DO $$ BEGIN CREATE TYPE core.enum_module AS ENUM (
    'CORE',          -- Login, usuarios, roles, permisos y auditoría
    'ADMIN'          -- Administración / configuración general
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tablas ───────────────────────────────────────────────────────────────────

-- Catálogo de permisos (slug). Sincronizado con core/permissions.constants.ts
CREATE TABLE IF NOT EXISTS core.permissions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    status      BOOLEAN DEFAULT TRUE,
    user_cr     INTEGER,
    date_cr     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up     INTEGER,
    date_up     BIGINT
);

CREATE TABLE IF NOT EXISTS core.users (
    id            SERIAL PRIMARY KEY,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    foto_url      VARCHAR(500),
    last_login    BIGINT,
    dni           VARCHAR(20),
    cargo         VARCHAR(150),
    enable        BOOLEAN DEFAULT TRUE,  -- Activo / Inactivo
    status        BOOLEAN DEFAULT TRUE,  -- Visible (Soft Delete) / Hidden
    user_cr       INTEGER,
    date_cr       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up       INTEGER,
    date_up       BIGINT
);

CREATE TABLE IF NOT EXISTS core.roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_system   BOOLEAN DEFAULT FALSE,
    enable      BOOLEAN DEFAULT TRUE,
    status      BOOLEAN DEFAULT TRUE,
    user_cr     INTEGER,
    date_cr     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up     INTEGER,
    date_up     BIGINT
);

CREATE TABLE IF NOT EXISTS core.role_permissions (
    id            SERIAL PRIMARY KEY,
    role_id       INTEGER NOT NULL REFERENCES core.roles(id),
    permission_id INTEGER NOT NULL REFERENCES core.permissions(id),
    status        BOOLEAN DEFAULT TRUE,
    user_cr       INTEGER,
    date_cr       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up       INTEGER,
    date_up       BIGINT,
    UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS core.user_roles (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES core.users(id),
    role_id INTEGER NOT NULL REFERENCES core.roles(id),
    status  BOOLEAN DEFAULT TRUE,
    user_cr INTEGER,
    date_cr BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up INTEGER,
    date_up BIGINT,
    UNIQUE (user_id, role_id)
);

-- Bitácora de auditoría inmutable (RNF-04, RNF-05).
CREATE TABLE IF NOT EXISTS core.audit_log (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES core.users(id),
    module     core.enum_module,
    table_name VARCHAR(100),
    record_id  INTEGER,
    action     core.enum_audit_action,
    old_data   JSONB,
    new_data   JSONB,
    ip_address VARCHAR(45),
    status     BOOLEAN DEFAULT TRUE,
    user_cr    INTEGER,
    date_cr    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up    INTEGER,
    date_up    BIGINT
);

-- Notificaciones del sistema (campana de notificaciones).
CREATE TABLE IF NOT EXISTS core.notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    INTEGER NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    title      VARCHAR(150) NOT NULL,
    message    TEXT NOT NULL,
    type       VARCHAR(30) NOT NULL,
    module     VARCHAR(50),
    link       VARCHAR(255),
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON core.notifications (user_id, is_read);

-- Códigos de recuperación de contraseña de usuarios internos (intranet).
CREATE TABLE IF NOT EXISTS core.password_recovery (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    recovery_code VARCHAR(6) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    expires_at    BIGINT NOT NULL,
    used          BOOLEAN DEFAULT FALSE,
    attempts      INTEGER DEFAULT 0,
    created_at    BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    used_at       BIGINT
);

CREATE INDEX IF NOT EXISTS idx_password_recovery_code ON core.password_recovery (recovery_code);
CREATE INDEX IF NOT EXISTS idx_password_recovery_user ON core.password_recovery (user_id);
CREATE INDEX IF NOT EXISTS idx_password_recovery_email ON core.password_recovery (email);
