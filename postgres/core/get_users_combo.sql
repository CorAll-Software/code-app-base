-- Lista mínima de usuarios activos para selectores (asignar a alguien, filtrar
-- por responsable). La usa GET /users/combo, que solo exige sesión: por eso NO
-- devuelve correo, teléfono, DNI ni roles, que son de core.get_users y piden
-- usuarios.view. Si una pantalla necesita más, que use GET /users.
CREATE OR REPLACE FUNCTION core.get_users_combo(req json)
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
            TRIM(u.first_name || ' ' || u.last_name) AS names,
            u.cargo
        FROM core.users u
        WHERE u.status = TRUE
        ORDER BY u.first_name, u.last_name
    ) t;

    RETURN COALESCE(result1, '[]'::json);
END
$function$;
