CREATE OR REPLACE FUNCTION core.update_user_password(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
    v_password_hash VARCHAR;
    v_user_cr INTEGER;
    v_token_cr UUID;
BEGIN
    v_id := (req->>'id')::INTEGER;
    v_password_hash := req->>'password_hash';
    -- Quién y desde qué sesión se cambió la contraseña. En el flujo público de
    -- recuperación no hay sesión todavía: ambos llegan NULL.
    v_user_cr := (req->>'user_cr')::INTEGER;
    v_token_cr := (req->>'token_cr')::UUID;

    IF v_id IS NULL OR v_password_hash IS NULL THEN
        RETURN json_build_object('error', 'ID y password_hash son requeridos');
    END IF;

    UPDATE core.users
    SET password_hash = v_password_hash,
        user_up = COALESCE(v_user_cr, v_id),
        token_up = v_token_cr,
        date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = v_id;

    RETURN json_build_object('success', TRUE);
END
$function$;
