CREATE OR REPLACE FUNCTION core.list_users_by_permission(req json)
RETURNS json
LANGUAGE plpgsql
AS $function$
DECLARE
    _slug          TEXT;
    _exclude_id    INTEGER;
    _include_admin BOOLEAN;
    _result        json;
BEGIN
    _slug          := NULLIF(TRIM(req ->> 'slug'), '');
    _exclude_id    := NULLIF(req ->> 'exclude_user_id', '')::INTEGER;
    _include_admin := COALESCE((req ->> 'include_admin')::BOOLEAN, TRUE);

    IF _slug IS NULL THEN
        RAISE EXCEPTION 'El slug del permiso es requerido';
    END IF;

    SELECT COALESCE(json_agg(t.id), '[]'::json) INTO _result
    FROM (
        SELECT DISTINCT u.id
        FROM core.users u
        WHERE u.enable = TRUE
          AND u.status = TRUE
          AND (_exclude_id IS NULL OR u.id <> _exclude_id)
          AND (
              EXISTS (
                  SELECT 1
                  FROM core.user_roles        ur
                  JOIN core.role_permissions  rp ON rp.role_id      = ur.role_id
                  JOIN core.permissions       p  ON p.id            = rp.permission_id
                  WHERE ur.user_id = u.id
                    AND p.slug     = _slug
                    AND ur.status  = TRUE
                    AND rp.status  = TRUE
                    AND p.status   = TRUE
              )
              OR (
                  _include_admin = TRUE
                  AND EXISTS (
                      SELECT 1
                      FROM core.user_roles ur
                      JOIN core.roles      r  ON r.id = ur.role_id
                      WHERE ur.user_id = u.id
                        AND r.name     = 'Administrador'
                        AND ur.status  = TRUE
                        AND r.status   = TRUE
                  )
              )
          )
    ) t;

    RETURN _result;
END
$function$;
