CREATE OR REPLACE FUNCTION core.update_user_foto(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id       INTEGER;
    v_foto_url TEXT;
    v_user_cr  INTEGER;
    result     json;
BEGIN
    v_id      := (req->>'id')::INTEGER;
    -- Acepta NULL explícito para eliminar la foto
    v_foto_url := req->>'foto_url';
    v_user_cr := (req->>'user_cr')::INTEGER;

    UPDATE core.users
    SET foto_url = v_foto_url,
        user_up  = v_user_cr,
        date_up  = EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE id = v_id AND status = TRUE;

    SELECT json_build_object('id', id, 'foto_url', foto_url)
    INTO result
    FROM core.users
    WHERE id = v_id;

    RETURN result;
END
$function$;
