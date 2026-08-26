CREATE OR REPLACE FUNCTION core.save_user(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id            INTEGER;
    v_first_name    VARCHAR;
    v_last_name     VARCHAR;
    v_email         VARCHAR;
    v_password_hash VARCHAR;
    v_phone         VARCHAR;
    v_status        BOOLEAN;
    v_enable        BOOLEAN;
    v_dni           VARCHAR;
    v_cargo         VARCHAR;
    v_rol_sistema   JSON;
    v_user_cr       INTEGER;
    v_token_cr      UUID;
    result          json;
BEGIN
    v_id            := (req->>'id')::INTEGER;
    v_first_name    := req->>'first_name';
    v_last_name     := req->>'last_name';
    v_email         := req->>'email';
    v_password_hash := req->>'password_hash';
    v_phone         := req->>'phone';
    v_enable        := COALESCE((req->>'enable')::BOOLEAN, TRUE);
    v_status        := COALESCE((req->>'status')::BOOLEAN, TRUE);
    v_dni           := req->>'dni';
    v_cargo         := req->>'cargo';
    v_rol_sistema   := req->'rol_sistema';
    v_user_cr       := (req->>'user_cr')::INTEGER;
    v_token_cr      := (req->>'token_cr')::UUID;

    -- Validaciones de unicidad
    IF EXISTS (
        SELECT 1 FROM core.users
        WHERE email = v_email AND status = TRUE AND (v_id IS NULL OR id != v_id)
    ) THEN
        RAISE EXCEPTION 'Ya existe un usuario activo con este correo electrónico: %', v_email;
    END IF;

    IF v_dni IS NOT NULL AND v_dni != '' AND EXISTS (
        SELECT 1 FROM core.users
        WHERE dni = v_dni AND status = TRUE AND (v_id IS NULL OR id != v_id)
    ) THEN
        RAISE EXCEPTION 'Ya existe un usuario activo con este DNI: %', v_dni;
    END IF;

    IF v_id IS NULL OR v_id = 0 THEN
        INSERT INTO core.users (
            first_name, last_name, email, password_hash, phone,
            enable, status, dni, cargo, user_cr, token_cr
        ) VALUES (
            v_first_name, v_last_name, v_email, v_password_hash, v_phone,
            v_enable, v_status, v_dni, v_cargo, v_user_cr, v_token_cr
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE core.users SET
            first_name    = COALESCE(v_first_name, first_name),
            last_name     = COALESCE(v_last_name, last_name),
            email         = COALESCE(v_email, email),
            password_hash = COALESCE(v_password_hash, password_hash),
            phone         = COALESCE(v_phone, phone),
            enable        = v_enable,
            status        = v_status,
            dni           = COALESCE(v_dni, dni),
            cargo         = COALESCE(v_cargo, cargo),
            user_up       = v_user_cr,
            token_up      = v_token_cr,
            date_up       = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = v_id;
    END IF;

    -- Manejar roles
    IF v_rol_sistema IS NOT NULL AND json_typeof(v_rol_sistema) = 'array' THEN
        UPDATE core.user_roles
        SET status = FALSE,
            user_up = v_user_cr,
            token_up = v_token_cr,
            date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE user_id = v_id
          AND role_id NOT IN (
              SELECT DISTINCT (json_array_elements_text(v_rol_sistema))::INTEGER
          );

        INSERT INTO core.user_roles (user_id, role_id, status, user_cr, token_cr)
        SELECT DISTINCT v_id, elem.id::INTEGER, TRUE, v_user_cr, v_token_cr
        FROM (SELECT (json_array_elements_text(v_rol_sistema))::INTEGER AS id) elem
        ON CONFLICT (user_id, role_id) DO UPDATE
            SET status = TRUE,
                user_up = EXCLUDED.user_cr,
                token_up = EXCLUDED.token_cr,
                date_up = EXTRACT(EPOCH FROM NOW())::BIGINT;
    END IF;

    -- Retornar usuario actualizado
    SELECT json_build_object(
        'id', u.id,
        'first_name', u.first_name,
        'last_name', u.last_name,
        'names', TRIM(u.first_name || ' ' || u.last_name),
        'email', u.email,
        'status', u.status,
        'enable', u.enable,
        'dni', u.dni,
        'phone', u.phone,
        'foto_url', u.foto_url,
        'cargo', u.cargo,
        'rol_sistema', (SELECT COALESCE(json_agg(DISTINCT role_id), '[]'::json)
                        FROM core.user_roles WHERE user_id = u.id AND status = TRUE)
    ) INTO result
    FROM core.users u
    WHERE u.id = v_id;

    RETURN result;
END
$function$;
