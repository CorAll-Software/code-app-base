CREATE OR REPLACE FUNCTION core.delete_user(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
BEGIN
    v_id := (req->>'id')::INTEGER;

    UPDATE core.users 
    SET status = FALSE,
        date_up = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = v_id;

    RETURN json_build_object('status', 'success', 'id', v_id);
END
$function$;
