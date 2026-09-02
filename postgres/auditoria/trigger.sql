-- =============================================================================
-- ESQUEMA: auditoria
-- TRIGGER GENÉRICO — una sola función para TODAS las tablas
-- Depende de: auditoria-tables.sql, contexto.sql
-- =============================================================================
--
-- No hay un trigger por tabla: hay UNO, y `auditoria.activar_tabla()` lo
-- instala resolviendo la clave primaria por el catálogo del sistema y
-- pasándosela por TG_ARGV. Así una tabla nueva queda auditada con una línea y
-- nadie puede "olvidarse" del historial al crear un módulo.
--
--   TG_ARGV[0] = columna PK (cadena vacía si la tabla no tiene)
--   TG_ARGV[1] = columnas ignoradas en el diff, separadas por coma
--
-- ── Por qué AFTER y no BEFORE ────────────────────────────────────────────────
-- Se dispara AFTER, así que solo registra cambios que efectivamente se
-- aplicaron: si la operación falla más adelante en la transacción, el rollback
-- se lleva también la fila de bitácora. La auditoría nunca debe decir que
-- ocurrió algo que no ocurrió.
--
-- ── Falla cerrado ────────────────────────────────────────────────────────────
-- Si esta función falla, la operación auditada falla con ella: NO hay
-- EXCEPTION WHEN OTHERS. Es deliberado — un cambio que no se puede auditar no
-- debe confirmarse. La salida de emergencia es `auditoria.desactivar_tabla()`.
-- =============================================================================

CREATE OR REPLACE FUNCTION auditoria.auditar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    _pk        TEXT   := NULLIF(TG_ARGV[0], '');
    _ignoradas TEXT[] := COALESCE(string_to_array(NULLIF(TG_ARGV[1], ''), ','), '{}'::TEXT[]);

    _antes       JSONB;
    _despues     JSONB;
    _campos      JSONB;
    _operacion   auditoria.enum_operacion := TG_OP::auditoria.enum_operacion;
    _detalle     TEXT;

    _id_registro TEXT;
    _usuario_id  INTEGER;
    _sesion_id   UUID;
    _id_caso     TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        _despues := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        _antes := to_jsonb(OLD);
    ELSE
        _antes   := to_jsonb(OLD);
        _despues := to_jsonb(NEW);

        -- Diff sobre los valores REALES: qué columna cambió, de qué a qué.
        SELECT jsonb_object_agg(k, jsonb_build_object('antes', _antes -> k, 'despues', _despues -> k))
          INTO _campos
          FROM jsonb_object_keys(_despues) AS k
         WHERE NOT (k = ANY (_ignoradas))
           AND (_despues -> k) IS DISTINCT FROM (_antes -> k);

        -- Un UPDATE que reescribe los mismos valores —o que solo movió
        -- `date_up`/`user_up`/`token_up`— no es una acción observable: no se
        -- registra. `save_user` hace UPDATE con COALESCE campo a campo y
        -- reescribe la fila entera en cada guardado; sin esto, abrir y cerrar
        -- un formulario sin tocar nada dejaría una fila de bitácora vacía.
        IF _campos IS NULL THEN
            RETURN NULL;
        END IF;

        -- En este sistema no se borra: se da de baja con `status = FALSE`
        -- (postgres/README.md). Traducirlo hace la bitácora legible — un log
        -- lleno de "UPDATE" indistinguibles no se lee.
        --
        -- `enable` NO se traduce a propósito: activar/desactivar una cuenta es
        -- otra cosa que darla de baja, y en el diff se lee tal cual.
        IF (_antes ->> 'status') = 'true' AND (_despues ->> 'status') = 'false' THEN
            _operacion := 'BAJA';
        ELSIF (_antes ->> 'status') = 'false' AND (_despues ->> 'status') = 'true' THEN
            _operacion := 'REACTIVACION';
        END IF;

        -- Resumen legible de una línea: qué columnas se tocaron. Se calcula
        -- ANTES de enmascarar porque solo usa los nombres, no los valores.
        _detalle := (SELECT string_agg(k, ', ' ORDER BY k) FROM jsonb_object_keys(_campos) AS k);

        -- El diff se enmascara DESPUÉS de calcularse: así queda constancia de
        -- que la contraseña cambió (la columna aparece en el diff) sin guardar
        -- ninguno de los dos valores. Enmascarar antes habría hecho que
        -- '***' = '***' y el cambio habría desaparecido del historial.
        SELECT jsonb_object_agg(
                   k,
                   CASE WHEN auditoria.es_sensible(k)
                        THEN jsonb_build_object('antes', to_jsonb('***'::TEXT), 'despues', to_jsonb('***'::TEXT))
                        ELSE _campos -> k END)
          INTO _campos
          FROM jsonb_object_keys(_campos) AS k;
    END IF;

    IF _pk IS NOT NULL THEN
        _id_registro := LEFT(COALESCE(_despues ->> _pk, _antes ->> _pk), 80);
    END IF;

    -- ── Quién actuó ──────────────────────────────────────────────────────────
    -- Primero el contexto que declaró la función de negocio; si no llegó, las
    -- columnas de auditoría de la propia fila. Ese respaldo es lo que hace que
    -- el módulo sirva desde el primer día, aunque falte instrumentar sitios.
    _usuario_id := COALESCE(
        auditoria.ctx_int('app.usuario_id'),
        CASE TG_OP
            WHEN 'INSERT' THEN NULLIF(_despues ->> 'user_cr', '')::INTEGER
            WHEN 'DELETE' THEN COALESCE(NULLIF(_antes ->> 'user_up', '')::INTEGER,
                                        NULLIF(_antes ->> 'user_cr', '')::INTEGER)
            ELSE COALESCE(NULLIF(_despues ->> 'user_up', '')::INTEGER,
                          NULLIF(_despues ->> 'user_cr', '')::INTEGER)
        END);

    -- Desde qué dispositivo. Mismo respaldo con `token_cr`/`token_up`, que en
    -- este sistema son el `sid` de `core.user_sessions`.
    _sesion_id := COALESCE(
        auditoria.ctx_uuid('app.sesion_id'),
        CASE TG_OP
            WHEN 'INSERT' THEN NULLIF(_despues ->> 'token_cr', '')::UUID
            WHEN 'DELETE' THEN COALESCE(NULLIF(_antes ->> 'token_up', '')::UUID,
                                        NULLIF(_antes ->> 'token_cr', '')::UUID)
            ELSE COALESCE(NULLIF(_despues ->> 'token_up', '')::UUID,
                          NULLIF(_despues ->> 'token_cr', '')::UUID)
        END);

    -- ── A qué caso pertenece el cambio ───────────────────────────────────────
    -- La columna de la fila manda sobre el contexto: si la tabla dice a qué
    -- caso pertenece, esa es la respuesta. El contexto cubre las tablas que no
    -- lo llevan pero se editan dentro de un caso. Hoy ninguna tabla de `core`
    -- tiene `id_caso`: es el punto de extensión de cada proyecto.
    _id_caso := LEFT(COALESCE(
        NULLIF(_despues ->> 'id_caso', ''),
        NULLIF(_antes   ->> 'id_caso', ''),
        auditoria.ctx_text('app.id_caso')
    ), 80);

    INSERT INTO auditoria.log (
        esquema, entidad, id_registro, operacion,
        usuario_id, rol, sesion_id, id_caso,
        campos, datos_antes, datos_despues, detalle,
        ip, user_agent, endpoint
    ) VALUES (
        TG_TABLE_SCHEMA, TG_TABLE_NAME, _id_registro, _operacion,
        _usuario_id, auditoria.ctx_text('app.rol'), _sesion_id, _id_caso,
        _campos,
        -- Snapshot completo solo en los extremos del ciclo de vida: en un
        -- UPDATE el diff ya dice todo y duplicar la fila entera multiplicaría
        -- el tamaño de la bitácora sin añadir información.
        CASE WHEN TG_OP = 'DELETE' THEN auditoria.enmascarar(_antes)   END,
        CASE WHEN TG_OP = 'INSERT' THEN auditoria.enmascarar(_despues) END,
        _detalle,
        auditoria.ctx_text('app.ip'),
        auditoria.ctx_text('app.user_agent'),
        auditoria.ctx_text('app.endpoint')
    );

    RETURN NULL;  -- AFTER trigger: el valor de retorno se ignora
END;
$function$;
