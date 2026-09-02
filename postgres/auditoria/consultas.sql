-- =============================================================================
-- ESQUEMA: auditoria
-- CONSULTA DE LA BITÁCORA — solo lectura
-- Depende de: auditoria-tables.sql, instalacion.sql (get_cobertura)
-- =============================================================================
--
-- Todas con la firma `f(req json) RETURNS json` del sistema. No hay ninguna
-- función de escritura porque la tabla no admite ninguna: `save_*` y `delete_*`
-- no existen aquí a propósito, no por olvido.
--
--   get_log        -> línea de tiempo filtrable y paginada
--   get_registro   -> todo lo que le pasó a UN registro
--   get_filtros    -> catálogo de filtros, construido con lo que HAY en el log
--   get_cobertura  -> qué tablas tienen trigger y cuántos eventos llevan
-- =============================================================================

-- ── Nombre y rol del autor ───────────────────────────────────────────────────
-- El `rol` que guarda la fila es el que tenía la persona EN EL MOMENTO de la
-- acción, y es el que vale como evidencia. Solo cuando falta (acciones
-- anteriores a que la ruta empezara a mandarlo) se cae al rol actual, que es
-- una aproximación: por eso el orden del COALESCE no es intercambiable.
CREATE OR REPLACE FUNCTION auditoria.rol_actual(_usuario_id INTEGER)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $function$
    SELECT string_agg(r.name, ', ' ORDER BY r.name)
      FROM core.user_roles ur
      JOIN core.roles r ON r.id = ur.role_id
     WHERE ur.user_id = _usuario_id AND ur.status = TRUE;
$function$;

-- ── Línea de tiempo ──────────────────────────────────────────────────────────
-- req = { esquema, entidad, id_registro, usuario_id, id_caso, operacion,
--         desde, hasta, buscar, pagina, limite }
--   desde / hasta en epoch (segundos), como el resto del sistema.
CREATE OR REPLACE FUNCTION auditoria.get_log(req json)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _esquema     TEXT    := NULLIF(req ->> 'esquema', '');
    _entidad     TEXT    := NULLIF(req ->> 'entidad', '');
    _id_registro TEXT    := NULLIF(req ->> 'id_registro', '');
    _usuario_id  INTEGER := NULLIF(req ->> 'usuario_id', '')::INTEGER;
    _id_caso     TEXT    := NULLIF(req ->> 'id_caso', '');
    _operacion   TEXT    := NULLIF(UPPER(req ->> 'operacion'), '');
    _desde       BIGINT  := NULLIF(req ->> 'desde', '')::BIGINT;
    _hasta       BIGINT  := NULLIF(req ->> 'hasta', '')::BIGINT;
    _buscar      TEXT    := NULLIF(req ->> 'buscar', '');

    -- Tope duro de página: sin él, un `limite=100000` desde la barra de
    -- direcciones descargaría la bitácora entera en una sola respuesta.
    _limite      INTEGER := LEAST(COALESCE(NULLIF(req ->> 'limite', '')::INTEGER, 50), 500);
    _pagina      INTEGER := GREATEST(COALESCE(NULLIF(req ->> 'pagina', '')::INTEGER, 1), 1);

    _total       BIGINT;
    _lista       JSON;
BEGIN
    -- Una operación inexistente se trata como "sin filtro" en vez de reventar
    -- el casteo al ENUM: el filtro llega de la query string, y un valor viejo
    -- guardado en un marcador no debe devolver un 400.
    IF _operacion IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::auditoria.enum_operacion)) o
                        WHERE o::TEXT = _operacion) THEN
        _operacion := NULL;
    END IF;

    SELECT COUNT(*) INTO _total
      FROM auditoria.log l
     WHERE (_esquema     IS NULL OR l.esquema = _esquema)
       AND (_entidad     IS NULL OR l.entidad = _entidad)
       AND (_id_registro IS NULL OR l.id_registro = _id_registro)
       AND (_usuario_id  IS NULL OR l.usuario_id = _usuario_id)
       AND (_id_caso     IS NULL OR l.id_caso = _id_caso)
       AND (_operacion   IS NULL OR l.operacion::TEXT = _operacion)
       AND (_desde       IS NULL OR l.fecha >= _desde)
       AND (_hasta       IS NULL OR l.fecha <= _hasta)
       AND (_buscar      IS NULL OR l.detalle     ILIKE '%' || _buscar || '%'
                                 OR l.endpoint    ILIKE '%' || _buscar || '%'
                                 OR l.entidad     ILIKE '%' || _buscar || '%'
                                 OR l.id_registro ILIKE '%' || _buscar || '%');

    SELECT json_agg(row_to_json(x)) INTO _lista
    FROM (
        SELECT
            l.id_log,
            l.esquema,
            l.entidad,
            l.id_registro,
            l.operacion,
            l.usuario_id,
            COALESCE(TRIM(u.first_name || ' ' || u.last_name), 'Sistema') AS usuario,
            u.email AS email_usuario,
            COALESCE(l.rol, auditoria.rol_actual(l.usuario_id)) AS rol,
            l.sesion_id,
            l.id_caso,
            l.campos,
            l.datos_antes,
            l.datos_despues,
            l.detalle,
            l.ip,
            l.user_agent,
            l.endpoint,
            l.txid,
            l.fecha
        FROM auditoria.log l
        LEFT JOIN core.users u ON u.id = l.usuario_id
       WHERE (_esquema     IS NULL OR l.esquema = _esquema)
         AND (_entidad     IS NULL OR l.entidad = _entidad)
         AND (_id_registro IS NULL OR l.id_registro = _id_registro)
         AND (_usuario_id  IS NULL OR l.usuario_id = _usuario_id)
         AND (_id_caso     IS NULL OR l.id_caso = _id_caso)
         AND (_operacion   IS NULL OR l.operacion::TEXT = _operacion)
         AND (_desde       IS NULL OR l.fecha >= _desde)
         AND (_hasta       IS NULL OR l.fecha <= _hasta)
         AND (_buscar      IS NULL OR l.detalle     ILIKE '%' || _buscar || '%'
                                   OR l.endpoint    ILIKE '%' || _buscar || '%'
                                   OR l.entidad     ILIKE '%' || _buscar || '%'
                                   OR l.id_registro ILIKE '%' || _buscar || '%')
       -- `fecha` es epoch en segundos: dentro del mismo segundo el orden lo
       -- desempata la secuencia, que sí respeta el orden de inserción.
       ORDER BY l.fecha DESC, l.id_log DESC
       LIMIT _limite OFFSET (_pagina - 1) * _limite
    ) x;

    RETURN json_build_object(
        'data', COALESCE(_lista, '[]'::JSON),
        'total', _total,
        'page', _pagina,
        'page_size', _limite
    );
END;
$function$;

-- ── Historial completo de UN registro ────────────────────────────────────────
-- req = { esquema, entidad, id_registro, limite }
CREATE OR REPLACE FUNCTION auditoria.get_registro(req json)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _esquema     TEXT    := COALESCE(NULLIF(req ->> 'esquema', ''), 'core');
    _entidad     TEXT    := NULLIF(req ->> 'entidad', '');
    _id_registro TEXT    := NULLIF(req ->> 'id_registro', '');
    _limite      INTEGER := LEAST(COALESCE(NULLIF(req ->> 'limite', '')::INTEGER, 200), 1000);
    _lista       JSON;
BEGIN
    IF _entidad IS NULL OR _id_registro IS NULL THEN
        RETURN json_build_object('error', 'entidad e id_registro son obligatorios');
    END IF;

    SELECT json_agg(row_to_json(x)) INTO _lista
    FROM (
        SELECT
            l.id_log,
            l.esquema,
            l.entidad,
            l.id_registro,
            l.operacion,
            l.usuario_id,
            COALESCE(TRIM(u.first_name || ' ' || u.last_name), 'Sistema') AS usuario,
            u.email AS email_usuario,
            COALESCE(l.rol, auditoria.rol_actual(l.usuario_id)) AS rol,
            l.sesion_id,
            l.id_caso,
            l.campos,
            l.datos_antes,
            l.datos_despues,
            l.detalle,
            l.ip,
            l.user_agent,
            l.endpoint,
            l.txid,
            l.fecha
        FROM auditoria.log l
        LEFT JOIN core.users u ON u.id = l.usuario_id
       WHERE l.esquema = _esquema
         AND l.entidad = _entidad
         AND l.id_registro = _id_registro
       ORDER BY l.fecha DESC, l.id_log DESC
       LIMIT _limite
    ) x;

    RETURN json_build_object('data', COALESCE(_lista, '[]'::JSON));
END;
$function$;

-- ── Catálogo de filtros ──────────────────────────────────────────────────────
-- Se construye con lo que EXISTE en el log, no con listas fijas: una entidad
-- nueva aparece sola en el desplegable el día que registra su primer evento, y
-- ninguna opción del filtro puede devolver cero resultados.
CREATE OR REPLACE FUNCTION auditoria.get_filtros(req json DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _entidades   JSON;
    _operaciones JSON;
    _usuarios    JSON;
    _rango       RECORD;
BEGIN
    SELECT json_agg(row_to_json(x)) INTO _entidades
    FROM (
        SELECT l.esquema, l.entidad, COUNT(*) AS eventos
          FROM auditoria.log l
         GROUP BY l.esquema, l.entidad
         ORDER BY l.esquema, l.entidad
    ) x;

    SELECT json_agg(row_to_json(x)) INTO _operaciones
    FROM (
        SELECT l.operacion, COUNT(*) AS eventos
          FROM auditoria.log l
         GROUP BY l.operacion
         ORDER BY COUNT(*) DESC
    ) x;

    -- Solo quienes figuran en la bitácora: el catálogo completo de usuarios ya
    -- lo sirve `GET /users`, y aquí solo estorbaría con gente que nunca hizo
    -- nada. El tope evita que un sistema con miles de usuarios activos devuelva
    -- un desplegable inmanejable.
    SELECT json_agg(row_to_json(x)) INTO _usuarios
    FROM (
        SELECT l.usuario_id,
               COALESCE(TRIM(u.first_name || ' ' || u.last_name), 'Usuario ' || l.usuario_id) AS usuario,
               auditoria.rol_actual(l.usuario_id) AS rol,
               COUNT(*) AS eventos
          FROM auditoria.log l
          LEFT JOIN core.users u ON u.id = l.usuario_id
         WHERE l.usuario_id IS NOT NULL
         GROUP BY l.usuario_id, u.first_name, u.last_name
         ORDER BY COUNT(*) DESC
         LIMIT 500
    ) x;

    SELECT MIN(fecha) AS desde, MAX(fecha) AS hasta, COUNT(*) AS total
      INTO _rango
      FROM auditoria.log;

    RETURN json_build_object(
        'entidades', COALESCE(_entidades, '[]'::JSON),
        'operaciones', COALESCE(_operaciones, '[]'::JSON),
        'usuarios', COALESCE(_usuarios, '[]'::JSON),
        'total', COALESCE(_rango.total, 0),
        'desde', _rango.desde,
        'hasta', _rango.hasta
    );
END;
$function$;

-- ── Estado de cobertura ──────────────────────────────────────────────────────
-- Qué tablas están auditadas y cuáles no, con sus eventos acumulados. Es la
-- consulta más importante del módulo: una tabla SIN trigger no aparece nunca en
-- la bitácora, y esa ausencia es indistinguible de "no pasó nada". Sin este
-- listado, un olvido al crear un módulo se lee como un sistema tranquilo.
--
-- req = { esquemas: ["core", "ventas"] }  · si falta, todos los esquemas de la
-- aplicación (se excluyen los del sistema y el propio `auditoria`).
CREATE OR REPLACE FUNCTION auditoria.get_cobertura(req json DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _esquemas TEXT[];
    _lista    JSON;
BEGIN
    SELECT ARRAY(SELECT json_array_elements_text(req -> 'esquemas')) INTO _esquemas;

    SELECT json_agg(row_to_json(x) ORDER BY x.esquema, x.tabla) INTO _lista
    FROM (
        SELECT n.nspname AS esquema,
               c.relname AS tabla,
               EXISTS (SELECT 1 FROM pg_trigger t
                        WHERE t.tgrelid = c.oid
                          AND t.tgname = 'trg_auditoria'
                          AND NOT t.tgisinternal) AS auditada,
               (SELECT COUNT(*) FROM auditoria.log l
                 WHERE l.esquema = n.nspname AND l.entidad = c.relname) AS eventos
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r'
           AND CASE
                 WHEN _esquemas IS NOT NULL AND cardinality(_esquemas) > 0
                     THEN n.nspname = ANY (_esquemas)
                 -- Por defecto, los esquemas de la aplicación. `auditoria`
                 -- queda fuera: la bitácora no se audita a sí misma, así que
                 -- listarla como "no auditada" sería una falsa alarma
                 -- permanente en la pantalla.
                 ELSE n.nspname NOT IN ('pg_catalog', 'information_schema', 'auditoria')
                      AND n.nspname NOT LIKE 'pg_%'
               END
    ) x;

    RETURN json_build_object('data', COALESCE(_lista, '[]'::JSON));
END;
$function$;
