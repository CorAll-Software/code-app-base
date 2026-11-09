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
    v_email_final   VARCHAR;
    v_dni_final     VARCHAR;
    v_status_final  BOOLEAN;
    v_user_cr       INTEGER;
    v_token_cr      UUID;
    result          json;
BEGIN
    -- Declara quién actúa (y desde qué sesión) para los triggers de auditoría.
    -- Va ANTES de cualquier escritura: lo que se declare después no lo verían
    -- los triggers ya disparados. Ver postgres/auditoria/contexto.sql.
    PERFORM auditoria.contexto(req);

    v_id            := (req->>'id')::INTEGER;
    v_first_name    := req->>'first_name';
    v_last_name     := req->>'last_name';
    -- El correo identifica la cuenta (login, recuperación), y el login lo
    -- busca sin distinguir mayúsculas. Se guarda normalizado para que
    -- 'Ana@x.com' y 'ana@x.com' no puedan ser dos cuentas activas distintas.
    -- Vacío = no viene.
    v_email         := NULLIF(lower(trim(req->>'email')), '');
    v_password_hash := req->>'password_hash';
    v_phone         := req->>'phone';
    -- Sin COALESCE aquí: un NULL significa "no viene". El alta lo trata como
    -- TRUE y la edición conserva el valor actual. Si se rellenara con TRUE de
    -- entrada, editar sólo el teléfono volvería a habilitar a un usuario
    -- deshabilitado.
    v_enable        := (req->>'enable')::BOOLEAN;
    v_status        := (req->>'status')::BOOLEAN;
    v_dni           := req->>'dni';
    v_cargo         := req->>'cargo';
    v_rol_sistema   := req->'rol_sistema';
    v_user_cr       := (req->>'user_cr')::INTEGER;
    v_token_cr      := (req->>'token_cr')::UUID;

    -- Un usuario de sistema, o un rol de sistema, solo lo toca otro usuario de
    -- sistema (ver core/proteger_usuario_sistema.sql).
    PERFORM core.proteger_usuario_sistema(v_user_cr, NULLIF(v_id, 0), v_rol_sistema);

    -- Validaciones de unicidad, con los valores que QUEDARÁN en la fila: en
    -- una edición lo que no viene se conserva. Comparar solo lo que trae el
    -- req dejaba restaurar un usuario borrado ({id, status: true}, sin correo)
    -- aunque otro activo ya usara su correo. El índice ux_users_email_activo
    -- (core-tables.sql) respalda la regla del correo ante escrituras
    -- simultáneas.
    IF v_id IS NULL OR v_id = 0 THEN
        v_email_final  := v_email;
        v_dni_final    := v_dni;
        v_status_final := COALESCE(v_status, TRUE);
    ELSE
        SELECT COALESCE(v_email, lower(email)), COALESCE(v_dni, dni), COALESCE(v_status, status)
          INTO v_email_final, v_dni_final, v_status_final
        FROM core.users
        WHERE id = v_id;
    END IF;

    IF v_status_final AND EXISTS (
        SELECT 1 FROM core.users
        WHERE lower(email) = v_email_final AND status = TRUE AND id != COALESCE(NULLIF(v_id, 0), -1)
    ) THEN
        RAISE EXCEPTION 'Ya existe un usuario activo con este correo electrónico: %', v_email_final;
    END IF;

    IF v_status_final AND v_dni_final IS NOT NULL AND v_dni_final != '' AND EXISTS (
        SELECT 1 FROM core.users
        WHERE dni = v_dni_final AND status = TRUE AND id != COALESCE(NULLIF(v_id, 0), -1)
    ) THEN
        RAISE EXCEPTION 'Ya existe un usuario activo con este DNI: %', v_dni_final;
    END IF;

    IF v_id IS NULL OR v_id = 0 THEN
        INSERT INTO core.users (
            first_name, last_name, email, password_hash, phone,
            enable, status, dni, cargo, user_cr, token_cr
        ) VALUES (
            v_first_name, v_last_name, v_email, v_password_hash, v_phone,
            COALESCE(v_enable, TRUE), COALESCE(v_status, TRUE), v_dni, v_cargo, v_user_cr, v_token_cr
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE core.users SET
            first_name    = COALESCE(v_first_name, first_name),
            last_name     = COALESCE(v_last_name, last_name),
            email         = COALESCE(v_email, email),
            password_hash = COALESCE(v_password_hash, password_hash),
            phone         = COALESCE(v_phone, phone),
            enable        = COALESCE(v_enable, enable),
            status        = COALESCE(v_status, status),
            dni           = COALESCE(v_dni, dni),
            cargo         = COALESCE(v_cargo, cargo),
            user_up       = v_user_cr,
            token_up      = v_token_cr,
            date_up       = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = v_id;

        -- Si cambió el correo, los códigos de recuperación pendientes se
        -- pidieron para la dirección anterior: ya no deben servir.
        UPDATE core.password_recovery
        SET used = TRUE
        WHERE user_id = v_id
          AND used = FALSE
          AND lower(email) IS DISTINCT FROM (SELECT lower(email) FROM core.users WHERE id = v_id);
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
