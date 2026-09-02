-- =============================================================================
-- ESQUEMA DE BASE DE DATOS · Plantilla base CorAll
-- AGREGADO raíz: construye TODA la base de datos en orden de dependencias FK.
--
-- En la plantilla base solo existe el esquema `core`. Al agregar esquemas de
-- negocio, anexa aquí su DDL (después de core) y actualiza tables.dbml.
-- =============================================================================

-- =============================================================================
-- ESQUEMA: core — Identidad, accesos, auditoría y notificaciones (BASE)
-- Espejo de core/core-tables.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS core;

-- ── ENUMs ────────────────────────────────────────────────────────────────────

-- Motivo por el que una sesión dejó de estar activa (ver core/sessions/).
DO $$ BEGIN CREATE TYPE core.enum_session_revoke_reason AS ENUM (
    'LOGOUT',           -- El usuario cerró sesión en ese dispositivo
    'MANUAL',           -- El usuario la cerró desde "Sesiones" (otro dispositivo)
    'PASSWORD_CHANGE',  -- Cambio/restablecimiento de contraseña
    'REUSE_DETECTED',   -- Se presentó un refresh token ya rotado (posible robo)
    'ADMIN'             -- Cierre forzado por un administrador
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
    token_cr    UUID,
    date_cr     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up     INTEGER,
    token_up    UUID,
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
    token_cr      UUID,
    date_cr       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up       INTEGER,
    token_up      UUID,
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
    token_cr    UUID,
    date_cr     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up     INTEGER,
    token_up    UUID,
    date_up     BIGINT
);

CREATE TABLE IF NOT EXISTS core.role_permissions (
    id            SERIAL PRIMARY KEY,
    role_id       INTEGER NOT NULL REFERENCES core.roles(id),
    permission_id INTEGER NOT NULL REFERENCES core.permissions(id),
    status        BOOLEAN DEFAULT TRUE,
    user_cr       INTEGER,
    token_cr      UUID,
    date_cr       BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up       INTEGER,
    token_up      UUID,
    date_up       BIGINT,
    UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS core.user_roles (
    id       SERIAL PRIMARY KEY,
    user_id  INTEGER NOT NULL REFERENCES core.users(id),
    role_id  INTEGER NOT NULL REFERENCES core.roles(id),
    status   BOOLEAN DEFAULT TRUE,
    user_cr  INTEGER,
    token_cr UUID,
    date_cr  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    user_up  INTEGER,
    token_up UUID,
    date_up  BIGINT,
    UNIQUE (user_id, role_id)
);

-- La bitácora de auditoría vive en su propio esquema, más abajo en este mismo
-- archivo (ver «ESQUEMA: auditoria»). No es una tabla de `core`: es transversal
-- a todos los esquemas y trae sus propios triggers de inmutabilidad.

-- Notificaciones del sistema (campana de notificaciones).
CREATE TABLE IF NOT EXISTS core.notifications (
    id         UUID PRIMARY KEY DEFAULT uuidv7(),
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

-- Sesiones abiertas (refresh token rotativo). El `id` es el `sid` del access
-- token y el valor que se graba como `token_cr`/`token_up` en el resto de tablas.
-- Tabla de evento: SIN bloque de auditoría (la crea un login, no otra sesión).
CREATE TABLE IF NOT EXISTS core.user_sessions (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id            INTEGER NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    refresh_hash       CHAR(64) NOT NULL,   -- SHA-256 del refresh vigente (nunca en claro)
    ip_address         VARCHAR(45),
    user_agent         VARCHAR(300),
    device             VARCHAR(120),        -- Etiqueta legible, p.ej. 'Chrome · Windows'
    date_cr            BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    last_used_at       BIGINT,
    expires_at         BIGINT NOT NULL,
    revoked_at         BIGINT,
    revoked_reason     core.enum_session_revoke_reason,
    revoked_by_user    INTEGER,             -- Quién la cerró (usuario o admin)
    revoked_by_session UUID                 -- Desde qué sesión se cerró
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user    ON core.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh ON core.user_sessions (refresh_hash);

-- =============================================================================
-- ESQUEMA: auditoria — Bitácora inmutable de acciones (BASE)
-- Espejo de auditoria/auditoria-tables.sql
--
-- Va después de `core` por orden de lectura, no por dependencia: la bitácora no
-- tiene FK a ninguna tabla (`usuario_id` NO es un REFERENCES, igual que las
-- columnas de auditoría de fila) para que la evidencia sobreviva al borrado del
-- usuario que la generó.
--
-- Aquí solo está el DDL. Las funciones del módulo (contexto, trigger genérico,
-- instalación, eventos y consultas) viven en postgres/auditoria/*.sql y se
-- aplican con postgres/auditoria/install.sql, que además ACTIVA los triggers.
--
-- ESE INSTALADOR NO ES OPCIONAL. Sin él:
--   · la bitácora queda vacía para siempre — sin trigger, nada la escribe; y
--   · las funciones del núcleo fallan, porque todas abren con
--     `PERFORM auditoria.contexto(req)` y esa función no existiría.
-- Por eso se ejecuta justo después de este archivo y ANTES que postgres/core/*.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auditoria;

DO $$ BEGIN CREATE TYPE auditoria.enum_operacion AS ENUM (
    'INSERT', 'UPDATE', 'DELETE', 'BAJA', 'REACTIVACION',
    'LECTURA', 'DESCARGA', 'EXPORTACION',
    'LOGIN', 'LOGIN_FALLIDO', 'ACCESO_DENEGADO'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabla de EVENTO: sin bloque de auditoría de fila. Un `status` daría la forma
-- de ocultar una fila sin borrarla, que es justo el agujero que debe cerrar.
CREATE TABLE IF NOT EXISTS auditoria.log (
    id_log        BIGSERIAL PRIMARY KEY,
    esquema       VARCHAR(63) NOT NULL,
    entidad       VARCHAR(63) NOT NULL,   -- tabla física o recurso lógico
    id_registro   VARCHAR(80),            -- PK como texto: sirve para INTEGER y UUID
    operacion     auditoria.enum_operacion NOT NULL,
    usuario_id    INTEGER,
    rol           VARCHAR(100),
    sesion_id     UUID,                   -- core.user_sessions.id (el `sid`)
    id_caso       VARCHAR(80),            -- agregado de negocio; NULL en la plantilla
    campos        JSONB,                  -- UPDATE: {columna: {antes, despues}}
    datos_antes   JSONB,                  -- fila completa en DELETE
    datos_despues JSONB,                  -- fila completa en INSERT
    detalle       TEXT,
    ip            VARCHAR(60),
    user_agent    VARCHAR(300),
    endpoint      VARCHAR(200),
    txid          BIGINT NOT NULL DEFAULT txid_current(),
    fecha         BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_auditoria_registro  ON auditoria.log (esquema, entidad, id_registro, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario   ON auditoria.log (usuario_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_caso      ON auditoria.log (id_caso, fecha DESC) WHERE id_caso IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auditoria_operacion ON auditoria.log (operacion, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha     ON auditoria.log (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_txid      ON auditoria.log (txid);

-- Solo INSERT: una bitácora editable no prueba nada.
CREATE OR REPLACE FUNCTION auditoria.log_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'La bitácora de auditoría no es editable (operación % rechazada)', TG_OP;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria.log;
CREATE TRIGGER trg_auditoria_inmutable
    BEFORE UPDATE OR DELETE ON auditoria.log
    FOR EACH ROW EXECUTE FUNCTION auditoria.log_inmutable();

-- TRUNCATE no dispara triggers de fila: necesita el suyo, por sentencia.
DROP TRIGGER IF EXISTS trg_auditoria_no_truncate ON auditoria.log;
CREATE TRIGGER trg_auditoria_no_truncate
    BEFORE TRUNCATE ON auditoria.log
    FOR EACH STATEMENT EXECUTE FUNCTION auditoria.log_inmutable();

-- =============================================================================
-- ESQUEMAS DE NEGOCIO
-- Anexa aquí el DDL de cada esquema del proyecto, en orden de dependencias FK.
--
-- IMPORTANTE: tras añadir un esquema, actívale la auditoría con
--   SELECT auditoria.activar_esquema('<esquema>');
-- Sin eso sus tablas no aparecerán NUNCA en la bitácora, y esa ausencia se lee
-- igual que "no pasó nada". `auditoria.get_cobertura()` lo delata.
-- =============================================================================
