CREATE OR REPLACE FUNCTION core.get_permissions(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
	result1 json;
BEGIN
	SELECT json_agg(t) INTO result1
	FROM (
		SELECT 
            id, 
            name, 
            slug, 
            description, 
            status
		FROM core.permissions
		WHERE status = true
		ORDER BY slug ASC
	) t;

	RETURN COALESCE(result1, '[]'::json);
END
$function$;
