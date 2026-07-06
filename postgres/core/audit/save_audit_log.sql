CREATE OR REPLACE FUNCTION core.save_audit_log(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
    result json;
BEGIN
    INSERT INTO core.audit_log (
        user_id,
        module,
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        ip_address,
        user_cr
    ) VALUES (
        (req->>'user_id')::INTEGER,
        (req->>'module')::core.enum_module,
        req->>'table_name',
        (req->>'record_id')::INTEGER,
        (req->>'action')::core.enum_audit_action,
        CASE WHEN req->>'old_data' IS NOT NULL THEN (req->>'old_data')::JSONB ELSE NULL END,
        CASE WHEN req->>'new_data' IS NOT NULL THEN (req->>'new_data')::JSONB ELSE NULL END,
        req->>'ip_address',
        (req->>'user_id')::INTEGER
    ) RETURNING id INTO v_id;

    result := json_build_object('id', v_id);
    RETURN result;
END
$function$;
