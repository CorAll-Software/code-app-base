CREATE OR REPLACE FUNCTION core.delete_user(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
    v_user_cr INTEGER;
    v_token_cr UUID;
BEGIN
    v_id := (req->>'id')::INTEGER;
    v_user_cr := (req->>'user_cr')::INTEGER;
    v_token_cr := (req->>'token_cr')::UUID;

    UPDATE core.users
    SET status = FALSE,
        user_up = v_user_cr,
        token_up = v_token_cr,
        date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = v_id;

    RETURN json_build_object('status', 'success', 'id', v_id);
END
$function$;
