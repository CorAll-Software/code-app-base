-- =============================================================================
-- ESQUEMA: core
-- MÓDULO: notifications
-- TABLAS DEL SISTEMA DE NOTIFICACIONES
-- =============================================================================

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

-- Índice para optimizar consultas de la campana de notificaciones (leídas/no leídas)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
ON core.notifications (user_id, is_read);
