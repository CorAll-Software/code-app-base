CREATE OR REPLACE FUNCTION core.update_user_password(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
    v_password_hash VARCHAR;
BEGIN
    v_id := (req->>'id')::INTEGER;
    v_password_hash := req->>'password_hash';

    IF v_id IS NULL OR v_password_hash IS NULL THEN
        RETURN json_build_object('error', 'ID y password_hash son requeridos');
    END IF;

    UPDATE core.users 
    SET password_hash = v_password_hash,
        date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = v_id;

    RETURN json_build_object('success', TRUE);
END
$function$;
