CREATE OR REPLACE FUNCTION core.get_user_login_data(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
	result1 json;
	_user_id integer;
	_now bigint;
	_is_root boolean;
	_touch_login boolean;
BEGIN
	_user_id := cast(req ->> 'id' as integer);
	_now := extract(epoch from now())::bigint;
	-- Solo el LOGIN actualiza last_login. Las renovaciones de token (refresh y
	-- verify-token) reusan esta función pero no deben tocar el "último ingreso".
	_touch_login := COALESCE((req ->> 'touch_login')::boolean, FALSE);

	IF _user_id IS NULL THEN
		RAISE EXCEPTION 'El id de usuario es requerido';
	END IF;

	-- Verificar si el usuario tiene algún rol de sistema ( ROOT )
	SELECT EXISTS (
		SELECT 1 FROM core.user_roles ur
		JOIN core.roles r ON r.id = ur.role_id
		WHERE ur.user_id = _user_id AND r.is_system = TRUE AND ur.status = true
	) INTO _is_root;

	IF _touch_login THEN
		UPDATE core.users
		SET last_login = _now
		WHERE id = _user_id;
	END IF;

	SELECT
		json_build_object(
			'id', u.id,
			'email', u.email,
			'names', trim(concat_ws(' ', u.first_name, u.last_name)),
			'telefono', u.phone,
			'avatar', u.foto_url,
			'roles', COALESCE(roles.lista, '[]'::json),
			'permisos', COALESCE(perms.lista, '[]'::json)
		)
	INTO result1
	FROM core.users u
	LEFT JOIN LATERAL (
		SELECT json_agg(
			json_build_object('id', r.id, 'name', r.name, 'is_system', r.is_system)
			ORDER BY r.name
		) AS lista
		FROM core.user_roles ur
		JOIN core.roles r ON r.id = ur.role_id
		WHERE ur.user_id = u.id
		  AND ur.status  = true
		  AND r.status   = true
		  AND r.enable   = true
	) roles ON TRUE
	LEFT JOIN LATERAL (
		SELECT json_agg(slug ORDER BY slug) AS lista
		FROM (
			SELECT DISTINCT p.slug
			FROM core.permissions p
			WHERE p.status = true
			  AND (
				_is_root = true
				OR
				p.id IN (
					SELECT rp.permission_id
					FROM core.user_roles ur
					JOIN core.roles r        ON r.id  = ur.role_id
					JOIN core.role_permissions rp ON rp.role_id = r.id
					WHERE ur.user_id  = u.id
					  AND ur.status   = true
					  AND r.status    = true
					  AND r.enable    = true
					  AND rp.status   = true
				)
			  )
		) sq
	) perms ON TRUE
	WHERE u.id = _user_id
	  AND u.status = true
	  AND u.enable = true;

	-- Si no se encuentra el usuario, se lanza una excepción o roles
	IF result1 IS NULL THEN
		RAISE EXCEPTION 'Usuario no encontrado o inactivo';
	END IF;

	IF result1 -> 'roles' IS NULL OR (result1 -> 'roles')::jsonb = '[]'::jsonb THEN
		RAISE EXCEPTION 'El usuario no tiene roles asignados';
	END IF;

	RETURN result1;
END
$function$;
