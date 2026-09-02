-- =============================================================================
-- ESQUEMA: auditoria
-- CONTEXTO DE LA ACCIÓN Y ENMASCARADO DE SECRETOS
-- Depende de: auditoria-tables.sql
-- =============================================================================
--
-- ── Por qué no vale `current_user` ───────────────────────────────────────────
-- Un trigger solo ve la fila. `current_user` es siempre el usuario de conexión
-- del pool (`DB_USER`), idéntico para todos, así que la base por sí sola no
-- puede saber QUIÉN actuó.
--
-- Quién actúa lo sabe la función de negocio, porque el backend ya se lo manda:
-- es el mismo `user_cr`/`token_cr` que acaba en las columnas de auditoría de la
-- fila. Así que es la propia función la que lo declara al entrar, en una línea:
--
--     PERFORM auditoria.contexto(req);
--
-- ── Por qué SET LOCAL y no una transacción explícita ─────────────────────────
-- `set_config(..., TRUE)` es SET LOCAL: vale dentro de la transacción en curso
-- y muere con ella. Cada llamada de `execProcedure` es UNA sentencia —su propia
-- transacción implícita— sobre una conexión cualquiera del pool, así que:
--
--   · el valor vive exactamente lo que dura esa llamada y los triggers que se
--     disparan dentro de ella lo ven;
--   · NO se filtra a la siguiente petición que reutilice esa conexión, que es
--     lo que pasaría con `set_config(..., FALSE)`: el usuario A quedaría
--     firmando las acciones del usuario B. El tercer argumento TRUE no es un
--     detalle de estilo, es la diferencia entre auditar y mentir.
--
-- Por eso el backend NO abre BEGIN/COMMIT solo para declarar el contexto:
-- costaría dos viajes extra a la base por operación sin aportar nada. Y por eso
-- tampoco sirve llamar a `contexto()` en un `execProcedure` aparte: moriría al
-- terminar SU propia transacción, o iría a otra conexión del pool.
--
-- ── Qué pasa si una función no declara contexto ──────────────────────────────
-- La auditoría no se queda muda: el trigger cae en las columnas `user_up` /
-- `user_cr` de la propia fila. El contexto solo AÑADE precisión — borrados en
-- cascada, tablas sin esas columnas, la sesión y las trazas de red, que la base
-- no puede deducir por su cuenta. El módulo aporta valor desde el primer día.
-- =============================================================================

-- ── Forma canónica ───────────────────────────────────────────────────────────
-- La ip, el user agent y el endpoint solo llegan si la ruta los manda: son
-- datos de HTTP que la base nunca ve por sí misma.
CREATE OR REPLACE FUNCTION auditoria.contexto(
    _usuario_id INTEGER,
    _sesion_id  UUID DEFAULT NULL,
    _ip         TEXT DEFAULT NULL,
    _user_agent TEXT DEFAULT NULL,
    _endpoint   TEXT DEFAULT NULL,
    _rol        TEXT DEFAULT NULL,
    _id_caso    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Solo se fija lo que llega. Un NULO NO PISA lo ya declarado, de modo que
    -- un helper interno hereda el contexto de quien lo llamó en vez de
    -- vaciarlo: `core.save_user` declara el autor y la función auxiliar que
    -- invoque después sigue actuando en nombre de esa misma persona.
    IF _usuario_id IS NOT NULL THEN
        PERFORM set_config('app.usuario_id', _usuario_id::TEXT, TRUE);
    END IF;
    IF _sesion_id IS NOT NULL THEN
        PERFORM set_config('app.sesion_id', _sesion_id::TEXT, TRUE);
    END IF;
    IF _ip IS NOT NULL THEN
        PERFORM set_config('app.ip', LEFT(_ip, 60), TRUE);
    END IF;
    IF _user_agent IS NOT NULL THEN
        PERFORM set_config('app.user_agent', LEFT(_user_agent, 300), TRUE);
    END IF;
    IF _endpoint IS NOT NULL THEN
        PERFORM set_config('app.endpoint', LEFT(_endpoint, 200), TRUE);
    END IF;
    IF _rol IS NOT NULL THEN
        PERFORM set_config('app.rol', LEFT(_rol, 100), TRUE);
    END IF;
    IF _id_caso IS NOT NULL THEN
        PERFORM set_config('app.id_caso', LEFT(_id_caso, 80), TRUE);
    END IF;
END;
$function$;

-- ── Forma cómoda: el mismo `req json` que ya recibe la función ───────────────
-- Reconoce los nombres con los que ESTE sistema llama al autor de una acción,
-- de modo que la línea es idéntica en todas las funciones y nadie tiene que
-- recordar cómo se llamó el parámetro aquí.
--
-- El nombre canónico es `user_cr` (postgres/README.md); los demás son alias
-- que ya aparecen en el núcleo. `id` NO está en la lista a propósito: en este
-- sistema `id` es el identificador del REGISTRO que se está guardando, no el
-- del usuario, y aceptarlo atribuiría cada cambio al número equivocado.
--
-- Basta con que la ruta añada ip / user_agent / endpoint al json —como ya hace
-- `contextoAuditoria()` en backend/src/core/auditoria.ts— para que esas trazas
-- empiecen a guardarse, sin tocar la función SQL.
CREATE OR REPLACE FUNCTION auditoria.contexto(req json)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM auditoria.contexto(
        NULLIF(COALESCE(
            req ->> 'user_cr',      -- nombre canónico en save_*/delete_*
            req ->> 'user_up',
            req ->> 'user_id',
            req ->> 'usuario_id',
            req ->> 'id_usuario',
            req ->> 'requester_id'  -- lecturas: core.get_user_by_id
        ), '')::INTEGER,
        NULLIF(COALESCE(
            req ->> 'token_cr',     -- core.user_sessions.id = sid del token
            req ->> 'token_up',
            req ->> 'sesion_id',
            req ->> 'session_id',
            req ->> 'sid'
        ), '')::UUID,
        req ->> 'ip',
        req ->> 'user_agent',
        req ->> 'endpoint',
        req ->> 'rol',
        req ->> 'id_caso'
    );
EXCEPTION WHEN OTHERS THEN
    -- Un json con un id o un uuid mal formado NO puede tumbar la operación que
    -- se está auditando: se pierde la atribución fina y el trigger recurre a
    -- `user_up`/`user_cr` de la fila. Fallar aquí convertiría la auditoría en
    -- una causa de fallo de negocio, que es lo contrario de lo que se busca.
    NULL;
END;
$function$;

-- =============================================================================
-- LECTURA DEL CONTEXTO — la usan el trigger y registrar_evento
-- =============================================================================

CREATE OR REPLACE FUNCTION auditoria.ctx_text(_clave TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $function$
    -- El segundo argumento TRUE evita el error cuando la variable no se declaró
    -- en esta transacción (que es el caso normal: contexto ausente = NULL).
    SELECT NULLIF(current_setting(_clave, TRUE), '');
$function$;

CREATE OR REPLACE FUNCTION auditoria.ctx_int(_clave TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _valor TEXT := auditoria.ctx_text(_clave);
BEGIN
    IF _valor IS NULL THEN RETURN NULL; END IF;
    RETURN _valor::INTEGER;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION auditoria.ctx_uuid(_clave TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    _valor TEXT := auditoria.ctx_text(_clave);
BEGIN
    IF _valor IS NULL THEN RETURN NULL; END IF;
    RETURN _valor::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

-- =============================================================================
-- ENMASCARADO DE DATOS SENSIBLES
-- =============================================================================
-- La bitácora registra QUE la contraseña cambió, nunca su valor. Un log
-- consultable con hashes o códigos de recuperación dentro convierte la
-- auditoría en el problema que pretendía controlar: un solo lector con
-- `auditoria.view` se llevaría todos los secretos del sistema.

CREATE OR REPLACE FUNCTION auditoria.es_sensible(_columna TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT
        -- EXCEPCIÓN: `token_cr`/`token_up` NO son secretos pese a llamarse
        -- "token". Guardan `core.user_sessions.id` (el `sid`), que es un
        -- identificador de sesión, no una credencial —el secreto del refresh
        -- vive en `refresh_hash`, en una tabla que además está excluida de la
        -- auditoría. Enmascararlos borraría justo la traza del dispositivo que
        -- este sistema usa para rastrear cada fila.
        _columna !~* '^token_(cr|up)$'
        AND _columna ~* '(password|contrase|token|secret|hash|salt|api_key|recovery|codigo)';
$function$;

-- Enmascara los valores sensibles de una fila completa (snapshots de INSERT y
-- DELETE). Preserva la CLAVE: que la columna exista es información legítima;
-- lo que no puede salir es su valor.
CREATE OR REPLACE FUNCTION auditoria.enmascarar(_fila JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT CASE WHEN _fila IS NULL THEN NULL ELSE COALESCE(
        (SELECT jsonb_object_agg(
                    k,
                    CASE
                        -- Un NULL se deja como NULL: sustituirlo por '***'
                        -- diría que había un secreto donde no había nada.
                        WHEN auditoria.es_sensible(k) AND _fila -> k <> 'null'::jsonb
                            THEN to_jsonb('***'::TEXT)
                        ELSE _fila -> k
                    END)
           FROM jsonb_object_keys(_fila) AS k),
        '{}'::jsonb) END;
$function$;
