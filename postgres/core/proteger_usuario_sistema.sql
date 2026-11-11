-- Protección de los usuarios de sistema (con un rol is_system = TRUE).
--
-- Solo otro usuario de sistema puede modificarlos o asignar roles de sistema;
-- los permisos usuarios.* no bastan. Lanza una excepción que empieza por
-- BLINDADO (el frontend la reconoce).

-- ¿El usuario tiene algún rol de sistema activo?
CREATE OR REPLACE FUNCTION core.es_usuario_sistema(_user_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $function$
    SELECT _user_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM core.user_roles ur
        JOIN core.roles r ON r.id = ur.role_id
        WHERE ur.user_id = _user_id
          AND ur.status = TRUE
          AND r.status = TRUE
          AND r.is_system = TRUE
    );
$function$;

-- _actor    quien hace la operación (user_cr). NULL cuenta como no autorizado.
-- _objetivo usuario sobre el que se actúa; NULL en un alta.
-- _roles    array JSON de ids de rol que se van a asignar, o NULL si no cambian.
CREATE OR REPLACE FUNCTION core.proteger_usuario_sistema(
    _actor    INTEGER,
    _objetivo INTEGER,
    _roles    JSON DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
    IF core.es_usuario_sistema(_actor) THEN
        RETURN;
    END IF;

    IF core.es_usuario_sistema(_objetivo) THEN
        RAISE EXCEPTION 'BLINDADO: este usuario es administrador del sistema y solo otro administrador del sistema puede modificarlo.';
    END IF;

    IF _roles IS NOT NULL AND json_typeof(_roles) = 'array' AND EXISTS (
        SELECT 1
        FROM json_array_elements_text(_roles) elem
        JOIN core.roles r ON r.id = elem::INTEGER
        WHERE r.is_system = TRUE
    ) THEN
        RAISE EXCEPTION 'BLINDADO: solo un administrador del sistema puede asignar un rol de sistema.';
    END IF;
END
$function$;
