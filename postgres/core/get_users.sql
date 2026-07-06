CREATE OR REPLACE FUNCTION core.get_users(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    result1 json;
BEGIN
    SELECT json_agg(t) INTO result1
    FROM (
        SELECT
            u.id,
            u.first_name,
            u.last_name,
            TRIM(u.first_name || ' ' || u.last_name) AS names,
            u.email,
            u.phone,
            u.status,
            u.enable,
            u.dni,
            u.foto_url,
            u.cargo,
            (SELECT EXISTS (
                SELECT 1 FROM core.user_roles ur
                JOIN core.roles r ON ur.role_id = r.id
                WHERE ur.user_id = u.id AND ur.status = TRUE AND r.is_system = TRUE
            )) AS is_system_user,
            (SELECT COALESCE(json_agg(DISTINCT role_id), '[]'::json)
             FROM core.user_roles
             WHERE user_id = u.id AND status = TRUE) AS rol_sistema
        FROM core.users u
        WHERE u.status = TRUE
        ORDER BY
            (CASE WHEN EXISTS (
                SELECT 1 FROM core.user_roles ur
                JOIN core.roles r ON ur.role_id = r.id
                WHERE ur.user_id = u.id AND ur.status = TRUE AND r.is_system = TRUE
            ) THEN 0 ELSE 1 END) ASC,
            u.id DESC
    ) t;

    RETURN COALESCE(result1, '[]'::json);
END
$function$;
