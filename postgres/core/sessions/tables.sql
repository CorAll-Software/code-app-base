-- =============================================================================
-- ESQUEMA: core
-- MÓDULO: sessions
-- TABLAS DE SESIONES DE USUARIO (refresh token rotativo)
-- =============================================================================

-- Motivo por el que una sesión dejó de estar activa.
DO $$ BEGIN CREATE TYPE core.enum_session_revoke_reason AS ENUM (
    'LOGOUT',           -- El usuario cerró sesión en ese dispositivo
    'MANUAL',           -- El usuario la cerró desde "Sesiones" (otro dispositivo)
    'PASSWORD_CHANGE',  -- Cambio/restablecimiento de contraseña
    'REUSE_DETECTED',   -- Se presentó un refresh token ya rotado (posible robo)
    'ADMIN'             -- Cierre forzado por un administrador
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una fila por sesión (dispositivo/navegador). El `id` es el `sid` que viaja
-- dentro del access token y el que se graba como `token_cr`/`token_up` en el
-- resto de tablas: permite rastrear cada registro hasta la sesión que lo creó.
--
-- NOTA: esta tabla NO lleva el bloque de auditoría (`user_cr`/`token_cr`/…),
-- igual que core.notifications y core.password_recovery. Es una tabla de evento:
-- la crea un login, no otra sesión, así que `token_cr` sería siempre su propio
-- `id` y `user_cr` siempre `user_id`. El ciclo de vida se describe con columnas
-- propias, y quién la cerró con `revoked_by_*`.
CREATE TABLE IF NOT EXISTS core.user_sessions (
    id                 UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id            INTEGER NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    -- SHA-256 (hex) del refresh token VIGENTE. El token en claro nunca se guarda.
    refresh_hash       CHAR(64) NOT NULL,
    ip_address         VARCHAR(45),
    user_agent         VARCHAR(300),
    -- Etiqueta legible derivada del user-agent, p.ej. 'Chrome · Windows'.
    device             VARCHAR(120),
    date_cr            BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    last_used_at       BIGINT,
    expires_at         BIGINT NOT NULL,
    revoked_at         BIGINT,
    revoked_reason     core.enum_session_revoke_reason,
    -- Autor del cierre: el propio usuario desde otro dispositivo, o el
    -- administrador que lo forzó. NULL si expiró sola o la cerró el sistema.
    revoked_by_user    INTEGER,
    revoked_by_session UUID
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user    ON core.user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh ON core.user_sessions (refresh_hash);
