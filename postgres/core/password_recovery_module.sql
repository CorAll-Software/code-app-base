-- Schema: core
-- Módulo de recuperación de contraseña para usuarios internos (intranet).
-- La tabla core.password_recovery se define en core/core-tables.sql (agregado en tables.sql).

-- 1. Función para solicitar recuperación de contraseña
DROP FUNCTION IF EXISTS core.request_password_recovery(json);
CREATE OR REPLACE FUNCTION core.request_password_recovery(req json)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
    DECLARE
        _result        JSON;
        _email         VARCHAR(150);
        _user_id       INTEGER;
        _first_name    VARCHAR(100);
        _last_name     VARCHAR(100);
        _names         VARCHAR(200);
        _recovery_code VARCHAR(6);
        _expires_at    BIGINT;
        _now           BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    BEGIN
        _email := NULLIF(TRIM(req->>'email'), '');

        -- Verificar que el email existe y el usuario está activo
        SELECT id, first_name, last_name
          INTO _user_id, _first_name, _last_name
        FROM core.users
        WHERE email = _email
          AND status = TRUE
          AND enable = TRUE;

        IF _user_id IS NULL THEN
            RETURN json_build_object('error', 'No se encontró un usuario activo con ese correo electrónico');
        END IF;

        _names := TRIM(CONCAT_WS(' ', _first_name, _last_name));

        -- Generar código de 6 dígitos
        _recovery_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

        -- El código expira en 15 minutos (900 segundos)
        _expires_at := _now + 900;

        -- Desactivar códigos anteriores de este usuario
        UPDATE core.password_recovery
        SET used = TRUE
        WHERE user_id = _user_id AND used = FALSE;

        -- Insertar nuevo código de recuperación
        INSERT INTO core.password_recovery (user_id, recovery_code, email, expires_at, created_at)
        VALUES (_user_id, _recovery_code, _email, _expires_at, _now);

        RETURN json_build_object(
            'success', TRUE,
            'names', _names,
            'recovery_code', _recovery_code,
            'user_id', _user_id,
            'expires_at', _expires_at
        );
    END
$function$;


-- 2. Función para validar código de recuperación
DROP FUNCTION IF EXISTS core.validate_recovery_code(json);
CREATE OR REPLACE FUNCTION core.validate_recovery_code(req json)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
    DECLARE
        _email         VARCHAR(150);
        _recovery_code VARCHAR(6);
        _recovery_id   INTEGER;
        _now           BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    BEGIN
        _email := NULLIF(TRIM(req->>'email'), '');
        _recovery_code := NULLIF(TRIM(req->>'recovery_code'), '');

        SELECT id INTO _recovery_id
        FROM core.password_recovery
        WHERE email = _email
          AND recovery_code = _recovery_code
          AND used = FALSE
          AND expires_at > _now
        ORDER BY created_at DESC
        LIMIT 1;

        IF _recovery_id IS NULL THEN
            RETURN json_build_object('error', 'El código ingresado es inválido o ya ha expirado');
        END IF;

        RETURN json_build_object('success', TRUE);
    END
$function$;


-- 3. Función para restablecer contraseña con código
DROP FUNCTION IF EXISTS core.reset_password_with_code(json);
CREATE OR REPLACE FUNCTION core.reset_password_with_code(req json)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
    DECLARE
        _email         VARCHAR(150);
        _recovery_code VARCHAR(6);
        _password_hash VARCHAR(255);
        _user_id       INTEGER;
        _recovery_id   INTEGER;
        _now           BIGINT := EXTRACT(EPOCH FROM NOW())::BIGINT;
    BEGIN
        _email         := NULLIF(TRIM(req->>'email'), '');
        _recovery_code := NULLIF(TRIM(req->>'recovery_code'), '');
        _password_hash := NULLIF(TRIM(req->>'password_hash'), '');

        -- Validar nuevamente el código
        SELECT id, user_id INTO _recovery_id, _user_id
        FROM core.password_recovery
        WHERE email = _email
          AND recovery_code = _recovery_code
          AND used = FALSE
          AND expires_at > _now
        ORDER BY created_at DESC
        LIMIT 1;

        IF _recovery_id IS NULL THEN
            RETURN json_build_object('error', 'Sesión de recuperación inválida o expirada');
        END IF;

        -- Actualizar contraseña en core.users
        UPDATE core.users
        SET password_hash = _password_hash,
            date_up       = _now
        WHERE id = _user_id;

        -- Marcar código como usado
        UPDATE core.password_recovery
        SET used    = TRUE,
            used_at = _now
        WHERE id = _recovery_id;

        RETURN json_build_object('success', TRUE);
    END
$function$;
