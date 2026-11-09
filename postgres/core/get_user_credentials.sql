CREATE OR REPLACE FUNCTION core.get_user_credentials(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
	result1 json;
	_id integer;
	_email varchar(150);
BEGIN
	-- Con `id` se busca por id: es lo que usan las rutas con sesión, que ya
	-- saben quién es el usuario. El correo del token puede estar desactualizado
	-- (cambió después del login) y no debe decidir contra qué hash se compara.
	-- Sin `id`, por correo (login), sin distinguir mayúsculas; el índice
	-- ux_users_email_activo garantiza que hay a lo sumo una cuenta activa.
	_id := NULLIF(req ->> 'id', '')::integer;
	_email := lower(trim(req ->> 'email'));

	IF _id IS NULL AND (_email IS NULL OR _email = '') THEN
		RAISE EXCEPTION 'El correo electrónico es requerido';
	END IF;

	SELECT
		json_build_object(
			'id', u.id,
			'email', u.email,
			'password_hash', u.password_hash,
			'enable', u.enable
		)
	INTO result1
	FROM core.users u
	WHERE u.status = true
	  AND CASE WHEN _id IS NOT NULL THEN u.id = _id ELSE lower(u.email) = _email END
	LIMIT 1;

	RETURN result1;
END
$function$;
