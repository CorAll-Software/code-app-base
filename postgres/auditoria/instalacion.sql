-- =============================================================================
-- ESQUEMA: auditoria
-- INSTALACIÓN Y RETIRO DE LOS TRIGGERS
-- Depende de: auditoria-tables.sql, contexto.sql, trigger.sql
-- =============================================================================
--
-- Los triggers NO se escriben a mano tabla por tabla: se generan. La clave
-- primaria se resuelve por el catálogo del sistema (`pg_index`), no por una
-- convención de nombres, así que funciona igual con `id SERIAL` que con
-- `id UUID` que con una tabla sin PK.
--
-- Motivo: una tabla nueva queda auditada con una línea, y no hay forma de que
-- alguien añada una tabla a un módulo y "se olvide" del historial.
-- =============================================================================

-- ── Columnas que no cuentan como cambio ──────────────────────────────────────
-- El bloque de auditoría de fila de postgres/README.md. Son CONSECUENCIA del
-- cambio, no el cambio: si se contaran, todo UPDATE tendría diff (siempre se
-- mueve `date_up`) y la regla de "un UPDATE que no cambia nada no se registra"
-- no filtraría nada. Siguen guardándose enteras en los snapshots de INSERT y
-- DELETE, donde sí son información.
CREATE OR REPLACE FUNCTION auditoria.ignoradas_por_defecto()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT ARRAY[
        'user_cr', 'token_cr', 'date_cr', 'user_up', 'token_up', 'date_up',
        -- `core.users.last_login` es una marca de uso, no un cambio de datos:
        -- se mueve en CADA inicio de sesión. Sin ignorarla, todo login dejaría
        -- dos filas —el evento LOGIN y un UPDATE indistinguible— y en unos meses
        -- la bitácora sería mayormente ruido de "alguien entró".
        'last_login'
    ];
$function$;

-- ── Tablas fuera del barrido automático ──────────────────────────────────────
-- Cada exclusión, con su motivo. Se comparan tanto por nombre simple como
-- calificado (`esquema.tabla`), para poder excluir con precisión una tabla de
-- un esquema sin afectar a otra homónima de un módulo de negocio.
CREATE OR REPLACE FUNCTION auditoria.excluidas_por_defecto()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT ARRAY[
        -- RUIDO DE MÁQUINA. La rotación del refresh token hace un UPDATE cada
        -- pocos minutos por cada usuario activo (`core.rotate_user_session`).
        -- Con el trigger puesto, la bitácora se llenaría de renovaciones
        -- automáticas y sepultaría las acciones de personas.
        -- Lo que en esta tabla SÍ es una acción —iniciar sesión, cerrarla, una
        -- revocación, un reuso de token— se registra explícitamente con
        -- `auditoria.registrar_evento` (ver eventos.sql y sessions/procedures.sql).
        'core.user_sessions',

        -- RUIDO DE MÁQUINA. Las escribe el sistema, no un usuario desde una
        -- pantalla, y se marcan como leídas en lote. Auditar "se marcó leída
        -- la notificación" no responde ninguna pregunta que alguien vaya a
        -- hacerle a la bitácora.
        'core.notifications',

        -- EVENTO + SECRETO. Es un historial append-only de códigos de un solo
        -- uso, y su columna `recovery_code` es el código en claro. El hecho
        -- auditable (se cambió la contraseña) queda registrado en `core.users`,
        -- que sí está auditada.
        'core.password_recovery'

        -- La propia bitácora no se lista aquí: `activar_tabla` rechaza el
        -- esquema `auditoria` entero, para que ni siquiera se pueda activar a
        -- mano. Guardar el historial del historial no aporta nada y cada
        -- escritura se dispararía a sí misma.
    ];
$function$;

-- ── Activar UNA tabla ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auditoria.activar_tabla(
    _esquema TEXT,
    _tabla TEXT,
    _ignoradas TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
    _reg REGCLASS;
    _pk  TEXT;
BEGIN
    _reg := to_regclass(format('%I.%I', _esquema, _tabla));
    IF _reg IS NULL THEN
        RETURN json_build_object('status', 'invalid',
            'message', format('La tabla %s.%s no existe', _esquema, _tabla));
    END IF;

    IF _esquema = 'auditoria' THEN
        RETURN json_build_object('status', 'invalid',
            'message', 'La bitácora no se audita a sí misma');
    END IF;

    -- Primera columna de la clave primaria, resuelta por el CATÁLOGO. Es lo que
    -- permite que el trigger sea genérico: la tabla le dice a la función cómo
    -- se identifica un registro suyo, en vez de que la función lo adivine.
    SELECT a.attname
      INTO _pk
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
     WHERE i.indrelid = _reg
       AND i.indisprimary
     LIMIT 1;

    -- DROP + CREATE en vez de CREATE OR REPLACE TRIGGER: así reinstalar tras
    -- cambiar la PK o las columnas ignoradas actualiza los argumentos, y la
    -- función es reejecutable sin acumular triggers duplicados.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON %I.%I', _esquema, _tabla);
    EXECUTE format(
        'CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
        'FOR EACH ROW EXECUTE FUNCTION auditoria.auditar(%L, %L)',
        _esquema, _tabla,
        COALESCE(_pk, ''),
        array_to_string(COALESCE(_ignoradas, auditoria.ignoradas_por_defecto()), ',')
    );

    RETURN json_build_object('status', 'success',
        'tabla', format('%s.%s', _esquema, _tabla),
        'pk', COALESCE(_pk, ''));
END;
$function$;

-- ── Salida de emergencia ─────────────────────────────────────────────────────
-- Existe porque el trigger falla cerrado: si algún día la auditoría bloquea una
-- operación crítica en producción, hay que poder quitarla de en medio sin
-- editar código. Lo que se desactive aquí aparecerá en `get_cobertura` como
-- `auditada = false`, que es justo el aviso que debe quedar.
CREATE OR REPLACE FUNCTION auditoria.desactivar_tabla(_esquema TEXT, _tabla TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
BEGIN
    IF to_regclass(format('%I.%I', _esquema, _tabla)) IS NULL THEN
        RETURN json_build_object('status', 'invalid',
            'message', format('La tabla %s.%s no existe', _esquema, _tabla));
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON %I.%I', _esquema, _tabla);
    RETURN json_build_object('status', 'success', 'tabla', format('%s.%s', _esquema, _tabla));
END;
$function$;

-- ── Activar un ESQUEMA entero ────────────────────────────────────────────────
-- Al agregar un módulo de negocio basta con
-- `SELECT auditoria.activar_esquema('ventas');` — sin enumerar tablas.
CREATE OR REPLACE FUNCTION auditoria.activar_esquema(
    _esquema TEXT,
    _excluir TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
    _tabla     TEXT;
    _excluidas TEXT[] := COALESCE(_excluir, auditoria.excluidas_por_defecto());
    _activadas TEXT[] := '{}';
    _omitidas  TEXT[] := '{}';
BEGIN
    IF _esquema = 'auditoria' THEN
        RETURN json_build_object('status', 'invalid',
            'message', 'La bitácora no se audita a sí misma');
    END IF;

    FOR _tabla IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = _esquema
           AND c.relkind = 'r'          -- solo tablas ordinarias: ni vistas, ni particiones, ni secuencias
         ORDER BY c.relname
    LOOP
        IF _tabla = ANY (_excluidas)
           OR format('%s.%s', _esquema, _tabla) = ANY (_excluidas) THEN
            _omitidas := _omitidas || _tabla;
            CONTINUE;
        END IF;

        PERFORM auditoria.activar_tabla(_esquema, _tabla);
        _activadas := _activadas || _tabla;
    END LOOP;

    RETURN json_build_object('status', 'success',
        'esquema', _esquema,
        'total', cardinality(_activadas),
        'tablas', _activadas,
        -- Se devuelven también las omitidas: una exclusión silenciosa se lee
        -- igual que "aquí no pasa nada", que es el error que la cobertura
        -- existe para evitar.
        'omitidas', _omitidas);
END;
$function$;
