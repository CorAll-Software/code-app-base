-- =============================================================================
-- ESQUEMA: auditoria
-- EVENTOS QUE NINGÚN TRIGGER PUEDE VER (lecturas, descargas, sesión)
-- Depende de: auditoria-tables.sql, contexto.sql
-- =============================================================================
--
-- PostgreSQL dispara triggers en INSERT, UPDATE, DELETE y TRUNCATE. NO existe
-- un trigger de SELECT: leer una fila no es interceptable. Por eso "consultó la
-- ficha" y "descargó el documento" se registran EXPLÍCITAMENTE, con esta
-- función, desde donde se sirven esas lecturas.
--
-- El resultado va a la MISMA tabla que las escrituras: una consulta y una
-- edición se leen en la misma línea de tiempo y con el mismo formato. Una
-- bitácora aparte para lecturas obligaría a cruzar dos listados a mano para
-- responder "qué hizo esta persona el martes".
--
-- ── Qué NO auditar ───────────────────────────────────────────────────────────
-- Solo los accesos a INFORMACIÓN, no cada listado paginado. Auditar
-- `GET /users` (que además se pide en cada carga de la pantalla) produciría más
-- filas que todas las escrituras juntas y enterraría lo que importa. La lista
-- concreta de lecturas instrumentadas está en postgres/auditoria/README.md.
-- =============================================================================

-- ── Forma canónica ───────────────────────────────────────────────────────────
-- Los datos que no se pasan se toman del contexto de la transacción, así que
-- una función SQL que ya declaró `auditoria.contexto(req)` puede registrar un
-- evento sin repetir quién ni desde dónde.
CREATE OR REPLACE FUNCTION auditoria.registrar_evento(
    _entidad     TEXT,
    _operacion   TEXT,
    _id_registro TEXT    DEFAULT NULL,
    _usuario_id  INTEGER DEFAULT NULL,
    _id_caso     TEXT    DEFAULT NULL,
    _detalle     TEXT    DEFAULT NULL,
    _esquema     TEXT    DEFAULT 'core'
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $function$
DECLARE
    _id_log BIGINT;
BEGIN
    INSERT INTO auditoria.log (
        esquema, entidad, id_registro, operacion,
        usuario_id, rol, sesion_id, id_caso, detalle,
        ip, user_agent, endpoint
    ) VALUES (
        _esquema, _entidad, LEFT(_id_registro, 80),
        -- El casteo al ENUM es la validación: una operación inventada aborta
        -- aquí en vez de entrar como texto que nadie volverá a encontrar.
        UPPER(_operacion)::auditoria.enum_operacion,
        COALESCE(_usuario_id, auditoria.ctx_int('app.usuario_id')),
        auditoria.ctx_text('app.rol'),
        auditoria.ctx_uuid('app.sesion_id'),
        COALESCE(LEFT(_id_caso, 80), auditoria.ctx_text('app.id_caso')),
        _detalle,
        auditoria.ctx_text('app.ip'),
        auditoria.ctx_text('app.user_agent'),
        auditoria.ctx_text('app.endpoint')
    )
    RETURNING id_log INTO _id_log;

    RETURN _id_log;
END;
$function$;

-- ── Envoltorio JSON, para llamarla desde el backend ──────────────────────────
-- Nombre distinto y no una sobrecarga de `registrar_evento`: una función con
-- un único argumento `json` conviviendo con otra cuyo primer parámetro es TEXT
-- y el resto tiene DEFAULT hace que PostgreSQL no pueda resolver una llamada
-- con un literal sin tipo ("function is not unique"). Con dos nombres, no hay
-- ambigüedad posible.
--
-- Firma `f(req json) RETURNS json` como el resto del sistema, para que se llame
-- con el mismo `execProcedure` de siempre.
CREATE OR REPLACE FUNCTION auditoria.registrar_evento_req(req json)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
    _id_log BIGINT;
BEGIN
    -- Declara el autor de la acción. Aquí sirve además para que la ip, el user
    -- agent y el endpoint que manda la ruta lleguen al evento sin repetirlos
    -- como parámetros.
    PERFORM auditoria.contexto(req);

    IF COALESCE(req ->> 'entidad', '') = '' OR COALESCE(req ->> 'operacion', '') = '' THEN
        RETURN json_build_object('status', 'invalid',
            'message', 'entidad y operacion son obligatorios');
    END IF;

    _id_log := auditoria.registrar_evento(
        req ->> 'entidad',
        req ->> 'operacion',
        req ->> 'id_registro',
        NULLIF(req ->> 'usuario_id', '')::INTEGER,
        req ->> 'id_caso',
        req ->> 'detalle',
        COALESCE(NULLIF(req ->> 'esquema', ''), 'core')
    );

    RETURN json_build_object('status', 'success', 'id_log', _id_log);
END;
$function$;
