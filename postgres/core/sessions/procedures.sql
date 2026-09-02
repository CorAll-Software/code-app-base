-- =============================================================================
-- ESQUEMA: core
-- MÓDULO: sessions
-- FUNCIONES DE SESIONES DE USUARIO (refresh token rotativo)
--
-- La BD es la fuente de verdad de una sesión; Redis solo cachea el estado
-- "activa/revocada" para la ruta caliente (ver backend/src/core/session.ts).
-- Las funciones del flujo de autenticación devuelven { "error": "..." } dentro
-- del JSON (en vez de RAISE) para que el backend pueda responder 401 sin
-- confundirlo con un fallo de infraestructura.
--
-- Una sesión está ACTIVA si `revoked_at IS NULL AND expires_at > now`. No hay
-- columna `status`: el cierre se expresa con `revoked_at` y su motivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. core.create_user_session
-- Abre una sesión nueva (login).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.create_user_session(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id      UUID := uuidv7();
    v_user_id INTEGER := (req->>'user_id')::INTEGER;
    v_now     BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    result    json;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'El id de usuario es requerido';
    END IF;

    INSERT INTO core.user_sessions (
        id, user_id, refresh_hash, ip_address, user_agent, device,
        expires_at, last_used_at
    ) VALUES (
        v_id,
        v_user_id,
        req->>'refresh_hash',
        req->>'ip_address',
        LEFT(req->>'user_agent', 300),
        LEFT(req->>'device', 120),
        (req->>'expires_at')::BIGINT,
        v_now
    );

    -- INICIO DE SESIÓN. `core.user_sessions` está excluida del trigger de
    -- auditoría porque la rotación del refresh token escribe cada pocos minutos
    -- por usuario activo y ahogaría la bitácora (ver auditoria/instalacion.sql).
    -- Pero abrir sesión SÍ es una acción, así que se registra explícitamente.
    -- El contexto se declara aquí mismo: en el login todavía no hay `sid`, y la
    -- ip y el user agent ya vienen en el propio `req`.
    PERFORM auditoria.contexto(v_user_id, v_id, req->>'ip_address', req->>'user_agent', req->>'endpoint');
    PERFORM auditoria.registrar_evento(
        'user_sessions', 'LOGIN', v_id::TEXT, v_user_id, NULL,
        'Inicio de sesión desde ' || COALESCE(req->>'device', 'dispositivo desconocido')
    );

    SELECT json_build_object(
        'id', id,
        'user_id', user_id,
        'expires_at', expires_at,
        'last_used_at', last_used_at,
        'device', device,
        'ip_address', ip_address,
        'date_cr', date_cr
    ) INTO result
    FROM core.user_sessions WHERE id = v_id;

    RETURN result;
END
$function$;

-- -----------------------------------------------------------------------------
-- 2. core.rotate_user_session
-- Canjea el refresh token por uno nuevo, rotando SIEMPRE el hash almacenado.
-- Si llega un refresh ya rotado (reuso), revoca la sesión completa: es la señal
-- de que el token fue robado y hay dos clientes usando la misma cadena.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.rotate_user_session(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id      UUID := (req->>'id')::UUID;
    v_hash    CHAR(64) := req->>'refresh_hash';
    v_now     BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    v_session core.user_sessions%ROWTYPE;
    result    json;
BEGIN
    SELECT * INTO v_session FROM core.user_sessions WHERE id = v_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Sesión no encontrada');
    END IF;

    IF v_session.revoked_at IS NOT NULL THEN
        RETURN json_build_object('error', 'La sesión fue cerrada');
    END IF;

    IF v_session.expires_at <= v_now THEN
        -- Vencimiento natural: se marca revoked_at para que el job de purga la
        -- recoja, pero sin motivo ni autor (nadie la cerró).
        UPDATE core.user_sessions SET revoked_at = v_now WHERE id = v_id;
        RETURN json_build_object('error', 'La sesión expiró');
    END IF;

    -- Reuso: el hash presentado no es el vigente -> se asume token comprometido.
    IF v_session.refresh_hash IS DISTINCT FROM v_hash THEN
        UPDATE core.user_sessions
        SET revoked_at = v_now, revoked_reason = 'REUSE_DETECTED'
        WHERE id = v_id;

        -- El evento de seguridad más importante de esta tabla: alguien presentó
        -- una credencial ya rotada, es decir, hay dos clientes con la misma
        -- cadena. Se registra como ACCESO_DENEGADO porque eso es lo que pasó —
        -- se rechazó una credencial— y así aparece junto al resto de intentos
        -- fallidos al filtrar la bitácora.
        PERFORM auditoria.contexto(v_session.user_id, v_id, req->>'ip_address', req->>'user_agent');
        PERFORM auditoria.registrar_evento(
            'user_sessions', 'ACCESO_DENEGADO', v_id::TEXT, v_session.user_id, NULL,
            'Refresh token ya rotado (posible robo): la sesión se cerró por seguridad'
        );

        RETURN json_build_object('error', 'Sesión cerrada por seguridad', 'reuse', TRUE);
    END IF;

    UPDATE core.user_sessions SET
        refresh_hash = req->>'new_refresh_hash',
        expires_at   = COALESCE((req->>'expires_at')::BIGINT, expires_at),
        ip_address   = COALESCE(req->>'ip_address', ip_address),
        user_agent   = COALESCE(LEFT(req->>'user_agent', 300), user_agent),
        device       = COALESCE(LEFT(req->>'device', 120), device),
        last_used_at = v_now
    WHERE id = v_id;

    SELECT json_build_object(
        'id', id,
        'user_id', user_id,
        'expires_at', expires_at,
        'last_used_at', last_used_at
    ) INTO result
    FROM core.user_sessions WHERE id = v_id;

    RETURN result;
END
$function$;

-- -----------------------------------------------------------------------------
-- 3. core.get_user_session
-- Lee UNA sesión por id. Respaldo cuando Redis no tiene la entrada cacheada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.get_user_session(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_now  BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    result json;
BEGIN
    SELECT json_build_object(
        'id', id,
        'user_id', user_id,
        'expires_at', expires_at,
        'revoked_at', revoked_at,
        'active', (revoked_at IS NULL AND expires_at > v_now)
    ) INTO result
    FROM core.user_sessions
    WHERE id = (req->>'id')::UUID;

    RETURN COALESCE(result, json_build_object('error', 'Sesión no encontrada'));
END
$function$;

-- -----------------------------------------------------------------------------
-- 4. core.get_user_sessions
-- Sesiones ACTIVAS del usuario, para la pestaña "Sesiones" del perfil.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.get_user_sessions(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id INTEGER := (req->>'user_id')::INTEGER;
    v_now     BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    result    json;
BEGIN
    SELECT COALESCE(json_agg(t ORDER BY t.last_used_at DESC NULLS LAST), '[]'::json)
    INTO result
    FROM (
        SELECT id, ip_address, user_agent, device,
               expires_at, last_used_at, date_cr
        FROM core.user_sessions
        WHERE user_id = v_user_id
          AND revoked_at IS NULL
          AND expires_at > v_now
    ) t;

    RETURN result;
END
$function$;

-- -----------------------------------------------------------------------------
-- 5. core.revoke_user_session
-- Cierra UNA sesión del usuario. Solo el dueño (user_id) puede cerrarla.
-- `actor_user`/`actor_session` son QUIÉN ejecuta el cierre: coinciden con el
-- dueño cuando lo hace él mismo, y son el administrador cuando lo fuerza.
-- Devuelve el id revocado para que el backend lo saque también de Redis.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.revoke_user_session(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id      UUID := (req->>'id')::UUID;
    v_user_id INTEGER := (req->>'user_id')::INTEGER;
    v_now     BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    v_revoked UUID;
BEGIN
    UPDATE core.user_sessions SET
        revoked_at         = v_now,
        revoked_reason     = COALESCE((req->>'reason')::core.enum_session_revoke_reason, 'MANUAL'),
        revoked_by_user    = (req->>'actor_user')::INTEGER,
        revoked_by_session = (req->>'actor_session')::UUID
    WHERE id = v_id
      AND user_id = v_user_id
      AND revoked_at IS NULL
    RETURNING id INTO v_revoked;

    IF v_revoked IS NULL THEN
        RETURN json_build_object('error', 'La sesión no existe o ya fue cerrada');
    END IF;

    -- CIERRE DE SESIÓN. Se registra como BAJA porque eso es: el recurso sesión
    -- deja de estar vigente sin desaparecer de la tabla, igual que un
    -- `status = FALSE` en cualquier otra entidad. El motivo (LOGOUT, MANUAL,
    -- ADMIN, PASSWORD_CHANGE) va en el detalle: es lo que distingue "el usuario
    -- cerró sesión" de "un administrador se la cerró".
    PERFORM auditoria.contexto(
        NULLIF(req->>'actor_user', '')::INTEGER,
        NULLIF(req->>'actor_session', '')::UUID
    );
    PERFORM auditoria.registrar_evento(
        'user_sessions', 'BAJA', v_revoked::TEXT,
        -- Sin actor conocido (cierre automático) la acción es del sistema
        -- sobre el dueño de la sesión: se atribuye a él antes que a nadie.
        COALESCE(NULLIF(req->>'actor_user', '')::INTEGER, v_user_id), NULL,
        'Sesión cerrada · motivo: ' || COALESCE(req->>'reason', 'MANUAL')
    );

    RETURN json_build_object('id', v_revoked);
END
$function$;

-- -----------------------------------------------------------------------------
-- 6. core.revoke_user_sessions
-- Cierra TODAS las sesiones del usuario; `except_id` conserva la actual
-- (botón "Cerrar las demás sesiones" y cambio de contraseña).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.revoke_user_sessions(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_user_id INTEGER := (req->>'user_id')::INTEGER;
    v_except  UUID := (req->>'except_id')::UUID;
    v_now     BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    v_ids     json;
BEGIN
    WITH revoked AS (
        UPDATE core.user_sessions SET
            revoked_at         = v_now,
            revoked_reason     = COALESCE((req->>'reason')::core.enum_session_revoke_reason, 'MANUAL'),
            revoked_by_user    = (req->>'actor_user')::INTEGER,
            revoked_by_session = (req->>'actor_session')::UUID
        WHERE user_id = v_user_id
          AND revoked_at IS NULL
          AND (v_except IS NULL OR id <> v_except)
        RETURNING id
    )
    SELECT COALESCE(json_agg(id), '[]'::json) INTO v_ids FROM revoked;

    -- Una fila de bitácora POR SESIÓN cerrada, no una por lote: el historial de
    -- cada dispositivo tiene que poder reconstruirse por separado, y todas
    -- comparten `txid`, así que en la pantalla se siguen leyendo como un mismo
    -- cierre masivo.
    PERFORM auditoria.contexto(
        NULLIF(req->>'actor_user', '')::INTEGER,
        NULLIF(req->>'actor_session', '')::UUID
    );
    PERFORM auditoria.registrar_evento(
        'user_sessions', 'BAJA', s.value #>> '{}',
        COALESCE(NULLIF(req->>'actor_user', '')::INTEGER, v_user_id), NULL,
        'Sesión cerrada en lote · motivo: ' || COALESCE(req->>'reason', 'MANUAL')
    )
    FROM json_array_elements(v_ids) AS s;

    RETURN json_build_object('ids', v_ids);
END
$function$;

-- -----------------------------------------------------------------------------
-- 7. core.purge_user_sessions
-- Borra físicamente las sesiones cerradas/expiradas hace más de `days` días
-- (30 por defecto). Pensada para un job periódico en run-server.ts.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.purge_user_sessions(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_days    INTEGER := COALESCE((req->>'days')::INTEGER, 30);
    v_cutoff  BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT - (v_days * 86400);
    v_deleted INTEGER;
BEGIN
    DELETE FROM core.user_sessions
    WHERE (revoked_at IS NOT NULL AND revoked_at < v_cutoff)
       OR expires_at < v_cutoff;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN json_build_object('deleted', v_deleted);
END
$function$;
