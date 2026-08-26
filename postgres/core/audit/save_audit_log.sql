CREATE OR REPLACE FUNCTION core.save_audit_log(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
    v_user_id INTEGER;
    v_token_cr UUID;
    result json;
BEGIN
    v_user_id  := (req->>'user_id')::INTEGER;
    -- Sesión (core.user_sessions.id) desde la que se ejecutó la acción auditada.
    v_token_cr := (req->>'token_cr')::UUID;

    INSERT INTO core.audit_log (
        user_id,
        module,
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        ip_address,
        user_cr,
        token_cr
    ) VALUES (
        v_user_id,
        (req->>'module')::core.enum_module,
        req->>'table_name',
        (req->>'record_id')::INTEGER,
        (req->>'action')::core.enum_audit_action,
        CASE WHEN req->>'old_data' IS NOT NULL THEN (req->>'old_data')::JSONB ELSE NULL END,
        CASE WHEN req->>'new_data' IS NOT NULL THEN (req->>'new_data')::JSONB ELSE NULL END,
        req->>'ip_address',
        v_user_id,
        v_token_cr
    ) RETURNING id INTO v_id;

    result := json_build_object('id', v_id);
    RETURN result;
END
$function$;
