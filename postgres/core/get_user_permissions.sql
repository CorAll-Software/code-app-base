-- Permisos efectivos de un usuario, como array JSON de slugs.
-- Definición ÚNICA de "qué puede hacer el usuario X": la reusan
-- core.get_user_login_data (para el payload de sesión) y el backend cuando
-- necesita recargar la caché de Redis (ver backend/src/core/permissions.ts).
CREATE OR REPLACE FUNCTION core.get_user_permissions(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    _user_id integer;
    _is_root boolean;
    _result  json;
BEGIN
    _user_id := (req ->> 'user_id')::integer;

    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'El id de usuario es requerido';
    END IF;

    -- Un rol de sistema (ROOT) otorga el catálogo completo.
    SELECT EXISTS (
        SELECT 1
        FROM core.user_roles ur
        JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.user_id = _user_id
          AND r.is_system = TRUE
          AND ur.status = TRUE
    ) INTO _is_root;

    SELECT COALESCE(json_agg(slug ORDER BY slug), '[]'::json) INTO _result
    FROM (
        SELECT DISTINCT p.slug
        FROM core.permissions p
        WHERE p.status = TRUE
          AND (
            _is_root = TRUE
            OR
            p.id IN (
                SELECT rp.permission_id
                FROM core.user_roles ur
                JOIN core.roles r             ON r.id = ur.role_id
                JOIN core.role_permissions rp ON rp.role_id = r.id
                WHERE ur.user_id = _user_id
                  AND ur.status  = TRUE
                  AND r.status   = TRUE
                  AND r.enable   = TRUE
                  AND rp.status  = TRUE
            )
          )
    ) sq;

    RETURN _result;
END
$function$;
