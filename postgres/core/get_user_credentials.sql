CREATE OR REPLACE FUNCTION core.get_user_credentials(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
	result1 json;
	_email varchar(150);
BEGIN
	_email := trim(req ->> 'email');

	IF _email IS NULL OR _email = '' THEN
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
	WHERE lower(u.email) = lower(_email)
	  AND u.status = true
	LIMIT 1;

	RETURN result1;
END
$function$;
