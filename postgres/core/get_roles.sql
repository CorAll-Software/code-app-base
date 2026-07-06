CREATE OR REPLACE FUNCTION core.get_roles(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
	result1 json;
BEGIN
	SELECT json_agg(t) INTO result1
	FROM (
		SELECT 
			r.id,
			r.name,
			r.description,
			r.status,
			r.enable,
			r.is_system,
			ARRAY(
				SELECT id FROM core.permissions WHERE status = true AND r.is_system = TRUE
				UNION
				SELECT rp.permission_id 
				FROM core.role_permissions rp 
				WHERE rp.role_id = r.id AND rp.status = true AND r.is_system = FALSE
			) as permissions
		FROM core.roles r
		WHERE r.status = true
		ORDER BY (CASE WHEN r.is_system = TRUE THEN 0 ELSE 1 END) ASC, r.id DESC
	) t;

	RETURN COALESCE(result1, '[]'::json);
END
$function$;
