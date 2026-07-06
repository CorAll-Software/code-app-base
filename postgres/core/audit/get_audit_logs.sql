CREATE OR REPLACE FUNCTION core.get_audit_logs(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_page INTEGER;
    v_page_size INTEGER;
    v_date_from BIGINT;
    v_date_to BIGINT;
    v_user_id INTEGER;
    v_module TEXT;
    v_action TEXT;
    v_table_name TEXT;
    v_offset INTEGER;
    v_total INTEGER;
    v_data json;
    result json;
BEGIN
    v_page := COALESCE((req->>'page')::INTEGER, 1);
    v_page_size := COALESCE((req->>'page_size')::INTEGER, 20);
    v_date_from := (req->>'date_from')::BIGINT;
    v_date_to := (req->>'date_to')::BIGINT;
    v_user_id := (req->>'user_id')::INTEGER;
    v_module := req->>'module';
    v_action := req->>'action';
    v_table_name := req->>'table_name';
    v_offset := (v_page - 1) * v_page_size;

    -- Contar total de registros con filtros
    SELECT COUNT(*) INTO v_total
    FROM core.audit_log al
    WHERE al.status = TRUE
        AND (v_date_from IS NULL OR al.date_cr >= v_date_from)
        AND (v_date_to IS NULL OR al.date_cr <= v_date_to)
        AND (v_user_id IS NULL OR al.user_id = v_user_id)
        AND (v_module IS NULL OR al.module::TEXT = v_module)
        AND (v_action IS NULL OR al.action::TEXT = v_action)
        AND (v_table_name IS NULL OR al.table_name ILIKE '%' || v_table_name || '%');

    -- Obtener registros con JOIN a users
    SELECT json_agg(t) INTO v_data
    FROM (
        SELECT
            al.id,
            al.user_id,
            COALESCE(u.first_name || ' ' || u.last_name, 'Sistema') AS user_name,
            u.email AS user_email,
            al.module,
            al.table_name,
            al.record_id,
            al.action,
            al.old_data,
            al.new_data,
            al.ip_address,
            al.date_cr
        FROM core.audit_log al
        LEFT JOIN core.users u ON u.id = al.user_id
        WHERE al.status = TRUE
            AND (v_date_from IS NULL OR al.date_cr >= v_date_from)
            AND (v_date_to IS NULL OR al.date_cr <= v_date_to)
            AND (v_user_id IS NULL OR al.user_id = v_user_id)
            AND (v_module IS NULL OR al.module::TEXT = v_module)
            AND (v_action IS NULL OR al.action::TEXT = v_action)
            AND (v_table_name IS NULL OR al.table_name ILIKE '%' || v_table_name || '%')
        ORDER BY al.date_cr DESC
        LIMIT v_page_size
        OFFSET v_offset
    ) t;

    result := json_build_object(
        'data', COALESCE(v_data, '[]'::json),
        'total', v_total,
        'page', v_page,
        'page_size', v_page_size
    );

    RETURN result;
END
$function$;
