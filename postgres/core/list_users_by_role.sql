-- Ids de los usuarios que tienen asignado un rol.
-- Se usa para invalidar la caché de permisos cuando se edita el rol: son
-- exactamente los usuarios cuyos permisos efectivos acaban de cambiar.
--
-- No filtra por `enable`/`status` del usuario a propósito: invalidar de más es
-- barato (la clave se recarga sola desde BD), pero olvidar a alguien lo deja
-- operando con permisos viejos.
CREATE OR REPLACE FUNCTION core.list_users_by_role(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    _role_id integer;
    _result  json;
BEGIN
    _role_id := (req ->> 'role_id')::integer;

    IF _role_id IS NULL THEN
        RAISE EXCEPTION 'El id del rol es requerido';
    END IF;

    SELECT COALESCE(json_agg(t.user_id), '[]'::json) INTO _result
    FROM (
        SELECT DISTINCT ur.user_id
        FROM core.user_roles ur
        WHERE ur.role_id = _role_id
          AND ur.status = TRUE
    ) t;

    RETURN _result;
END
$function$;
