-- =============================================================================
-- ESQUEMA: core
-- MÓDULO: notifications
-- PROCEDIMIENTOS Y FUNCIONES DEL SISTEMA DE NOTIFICACIONES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. core.create_notification
-- Crea una nueva notificación para un usuario
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.create_notification(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
    result json;
BEGIN
    INSERT INTO core.notifications (
        user_id, title, message, type, module, link
    ) VALUES (
        (req->>'user_id')::INTEGER,
        req->>'title',
        req->>'message',
        req->>'type',
        req->>'module',
        req->>'link'
    ) RETURNING id INTO v_id;

    SELECT json_build_object(
        'id', id,
        'user_id', user_id,
        'title', title,
        'message', message,
        'type', type,
        'module', module,
        'link', link,
        'is_read', is_read,
        'created_at', created_at
    ) INTO result
    FROM core.notifications
    WHERE id = v_id;

    RETURN result;
END
$function$;

-- -----------------------------------------------------------------------------
-- 2. core.list_notifications
-- Lista las notificaciones de un usuario con soporte para paginación y filtros
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.list_notifications(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id INTEGER := (req->>'user_id')::INTEGER;
    v_limit INTEGER := COALESCE((req->>'limit')::INTEGER, 10);
    v_offset INTEGER := COALESCE((req->>'offset')::INTEGER, 0);
    v_is_read BOOLEAN := (req->>'is_read')::BOOLEAN;
    result json;
BEGIN
    SELECT COALESCE(json_agg(t), '[]'::json) INTO result
    FROM (
        SELECT id, user_id, title, message, type, module, link, is_read, created_at
        FROM core.notifications
        WHERE user_id = v_user_id
          AND (v_is_read IS NULL OR is_read = v_is_read)
        ORDER BY created_at DESC
        LIMIT v_limit
        OFFSET v_offset
    ) t;

    RETURN result;
END
$function$;

-- -----------------------------------------------------------------------------
-- 3. core.count_unread_notifications
-- Cuenta el número de notificaciones no leídas para un usuario
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.count_unread_notifications(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id INTEGER := (req->>'user_id')::INTEGER;
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM core.notifications
    WHERE user_id = v_user_id AND is_read = FALSE;

    RETURN json_build_object('count', v_count);
END
$function$;

-- -----------------------------------------------------------------------------
-- 4. core.mark_notification_as_read
-- Marca una notificación específica como leída
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.mark_notification_as_read(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID := (req->>'id')::UUID;
BEGIN
    UPDATE core.notifications
    SET is_read = TRUE
    WHERE id = v_id;

    RETURN json_build_object('id', v_id, 'is_read', TRUE);
END
$function$;

-- -----------------------------------------------------------------------------
-- 5. core.mark_all_notifications_as_read
-- Marca todas las notificaciones pendientes de un usuario como leídas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.mark_all_notifications_as_read(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id INTEGER := (req->>'user_id')::INTEGER;
BEGIN
    UPDATE core.notifications
    SET is_read = TRUE
    WHERE user_id = v_user_id AND is_read = FALSE;

    RETURN json_build_object('user_id', v_user_id, 'marked_all_as_read', TRUE);
END
$function$;
