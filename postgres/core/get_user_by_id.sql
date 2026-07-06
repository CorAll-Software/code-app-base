CREATE OR REPLACE FUNCTION core.get_user_by_id(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    v_id   INTEGER;
    v_user json;
BEGIN
    v_id := (req->>'id')::INTEGER;

    SELECT json_build_object(
        'id', u.id,
        'first_name', u.first_name,
        'last_name', u.last_name,
        'names', TRIM(u.first_name || ' ' || u.last_name),
        'email', u.email,
        'phone', u.phone,
        'status', u.status,
        'enable', u.enable,
        'dni', u.dni,
        'foto_url', u.foto_url,
        'cargo', u.cargo,
        -- Roles
        'rol_sistema', (SELECT COALESCE(json_agg(DISTINCT role_id), '[]'::json)
                        FROM core.user_roles WHERE user_id = u.id AND status = TRUE),
        'is_system_user', (SELECT EXISTS (
            SELECT 1 FROM core.user_roles ur
            JOIN core.roles r ON ur.role_id = r.id
            WHERE ur.user_id = u.id AND ur.status = TRUE AND r.is_system = TRUE
        ))
    ) INTO v_user
    FROM core.users u
    WHERE u.id = v_id AND u.status = TRUE;

    RETURN COALESCE(v_user, '{}'::json);
END
$function$;
