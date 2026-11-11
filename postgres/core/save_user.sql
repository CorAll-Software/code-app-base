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
    v_permisos      JSON;
    v_permisos_actor JSON;
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
    -- Normalizado: el login lo busca sin mayúsculas. Vacío = no viene.
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
    -- Ids de permiso concedidos directamente; si no vienen, no se tocan.
    v_permisos      := req->'permisos_directos';
    IF json_typeof(v_permisos) IS DISTINCT FROM 'array' THEN
        v_permisos := NULL;
    END IF;
    v_user_cr       := (req->>'user_cr')::INTEGER;
    v_token_cr      := (req->>'token_cr')::UUID;

    -- Un usuario de sistema, o un rol de sistema, solo lo toca otro usuario de
    -- sistema (ver core/proteger_usuario_sistema.sql).
    PERFORM core.proteger_usuario_sistema(v_user_cr, NULLIF(v_id, 0), v_rol_sistema);

    -- Nadie concede un permiso que él mismo no tiene (salvo un usuario de
    -- sistema, que los tiene todos). Los que el usuario ya tenía no cuentan.
    IF v_permisos IS NOT NULL AND NOT core.es_usuario_sistema(v_user_cr) THEN
        v_permisos_actor := CASE WHEN v_user_cr IS NULL THEN '[]'::json
            ELSE core.get_user_permissions(json_build_object('user_id', v_user_cr)) END;

        IF EXISTS (
            SELECT 1
            FROM json_array_elements_text(v_permisos) elem
            JOIN core.permissions p ON p.id = elem::INTEGER
            WHERE p.slug NOT IN (SELECT json_array_elements_text(v_permisos_actor))
              AND NOT EXISTS (
                  SELECT 1 FROM core.user_permissions up
                  WHERE up.user_id = NULLIF(v_id, 0)
                    AND up.permission_id = p.id
                    AND up.status = TRUE
              )
        ) THEN
            RAISE EXCEPTION 'Solo puedes conceder permisos que tú mismo tienes.';
        END IF;
    END IF;

    -- Unicidad con los valores que QUEDARÁN en la fila (en una edición lo que
    -- no viene se conserva). ux_users_email_activo la respalda ante carreras.
    IF v_id IS NULL OR v_id = 0 THEN
        v_email_final  := v_email;
        v_dni_final    := v_dni;
        v_status_final := COALESCE(v_status, TRUE);
    ELSE
        SELECT COALESCE(v_email, email), COALESCE(v_dni, dni), COALESCE(v_status, status)
          INTO v_email_final, v_dni_final, v_status_final
        FROM core.users
        WHERE id = v_id;
    END IF;

    IF v_status_final AND EXISTS (
        SELECT 1 FROM core.users
        WHERE email = v_email_final AND status = TRUE AND id != COALESCE(NULLIF(v_id, 0), -1)
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

        -- Si cambió el correo, se anulan los códigos pedidos para el anterior.
        UPDATE core.password_recovery
        SET used = TRUE
        WHERE user_id = v_id
          AND used = FALSE
          AND email IS DISTINCT FROM (SELECT email FROM core.users WHERE id = v_id);
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

    -- Permisos directos: se sincronizan con la lista recibida. Solo se tocan
    -- las filas que cambian, para no llenar la bitácora de ediciones vacías.
    IF v_permisos IS NOT NULL THEN
        UPDATE core.user_permissions
        SET status = FALSE,
            user_up = v_user_cr,
            token_up = v_token_cr,
            date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE user_id = v_id
          AND status = TRUE
          AND permission_id NOT IN (
              SELECT (json_array_elements_text(v_permisos))::INTEGER
          );

        INSERT INTO core.user_permissions (user_id, permission_id, status, user_cr, token_cr)
        SELECT DISTINCT v_id, p.id, TRUE, v_user_cr, v_token_cr
        FROM json_array_elements_text(v_permisos) elem
        JOIN core.permissions p ON p.id = elem::INTEGER AND p.status = TRUE
        ON CONFLICT (user_id, permission_id) DO UPDATE
            SET status = TRUE,
                user_up = EXCLUDED.user_cr,
                token_up = EXCLUDED.token_cr,
                date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
            WHERE core.user_permissions.status = FALSE;
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
                        FROM core.user_roles WHERE user_id = u.id AND status = TRUE),
        'permisos_directos', (SELECT COALESCE(json_agg(permission_id ORDER BY permission_id), '[]'::json)
                              FROM core.user_permissions WHERE user_id = u.id AND status = TRUE)
    ) INTO result
    FROM core.users u
    WHERE u.id = v_id;

    RETURN result;
END
$function$;
