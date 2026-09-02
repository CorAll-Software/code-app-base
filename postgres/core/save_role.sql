CREATE OR REPLACE FUNCTION core.save_role(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
    v_name VARCHAR;
    v_description TEXT;
    v_status BOOLEAN;
    v_enable BOOLEAN;
    v_permissions_ids INTEGER[];
    v_user_cr INTEGER;
    v_token_cr UUID;
    result json;
BEGIN
    -- Declara quién actúa (y desde qué sesión) para los triggers de auditoría.
    -- Va ANTES de cualquier escritura: lo que se declare después no lo verían
    -- los triggers ya disparados. Ver postgres/auditoria/contexto.sql.
    PERFORM auditoria.contexto(req);

    v_id := (req->>'id')::INTEGER;
    v_name := req->>'name';
    v_description := req->>'description';
    v_status := COALESCE((req->>'status')::BOOLEAN, TRUE);
    v_enable := COALESCE((req->>'enable')::BOOLEAN, TRUE);
    v_permissions_ids := ARRAY(SELECT json_array_elements_text(COALESCE(req->'permissions_ids', '[]'::json))::INTEGER);
    v_user_cr := (req->>'user_cr')::INTEGER;
    v_token_cr := (req->>'token_cr')::UUID;

    -- PROTECCIÓN: Los roles de sistema no pueden ser modificados ni eliminados
    IF v_id IS NOT NULL AND v_id > 0 THEN
        IF EXISTS (SELECT 1 FROM core.roles WHERE id = v_id AND is_system = TRUE) THEN
            RAISE EXCEPTION 'Este es un rol de sistema vital y no puede ser modificado ni eliminado.';
        END IF;
    END IF;

    IF v_id IS NULL OR v_id = 0 THEN
        -- Insert
        INSERT INTO core.roles (
            name, description, status, enable, user_cr, token_cr
        ) VALUES (
            v_name, v_description, v_status, v_enable, v_user_cr, v_token_cr
        ) RETURNING id INTO v_id;
    ELSE
        -- Update
        UPDATE core.roles SET
            name = COALESCE(v_name, name),
            description = COALESCE(v_description, description),
            status = v_status,
            enable = v_enable,
            user_up = v_user_cr,
            token_up = v_token_cr,
            date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = v_id;
    END IF;

    -- Logic for permissions:
    -- 1. If status is FALSE (logical delete), we MUST deactivate all permissions.
    -- 2. If permissions_ids is present in the JSON (explicit update from form), we sync them.
    -- 3. If it's just a toggle of "enable", we DO NOT touch permissions.

    IF v_status = FALSE THEN
        -- Forced deactivation on logical delete
        UPDATE core.role_permissions
        SET status = FALSE,
            user_up = v_user_cr,
            token_up = v_token_cr,
            date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE role_id = v_id;

    ELSIF (req::jsonb) ? 'permissions_ids' THEN
        -- Explicit sync from form
        UPDATE core.role_permissions
        SET status = FALSE,
            user_up = v_user_cr,
            token_up = v_token_cr,
            date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE role_id = v_id;

        IF v_permissions_ids IS NOT NULL AND array_length(v_permissions_ids, 1) > 0 THEN
            INSERT INTO core.role_permissions (role_id, permission_id, status, user_cr, token_cr)
            SELECT v_id, p_id, TRUE, v_user_cr, v_token_cr
            FROM unnest(v_permissions_ids) p_id
            ON CONFLICT (role_id, permission_id)
            DO UPDATE SET
                status = TRUE,
                user_up = v_user_cr,
                token_up = v_token_cr,
                date_up = EXTRACT(EPOCH FROM NOW())::BIGINT;
        END IF;
    END IF;

    -- Return updated role
    SELECT json_build_object(
        'id', r.id,
        'name', r.name,
        'description', r.description,
        'status', r.status,
        'enable', r.enable,
        'permissions', ARRAY(
            SELECT rp.permission_id
            FROM core.role_permissions rp
            WHERE rp.role_id = r.id AND rp.status = true
        )
    ) INTO result
    FROM core.roles r
    WHERE r.id = v_id;

    RETURN result;
END
$function$;
