-- =============================================================================
-- ESQUEMA: auditoria — Bitácora inmutable de acciones
-- DDL del esquema. Espejo de auditoria/auditoria-tables.dbml.
-- Depende de: nada. Instalar ANTES que el resto del módulo.
-- =============================================================================
--
-- Las columnas `user_cr` / `date_cr` / `user_up` / `date_up` que lleva toda
-- tabla de entidad NO son un historial: guardan el ESTADO ACTUAL del registro
-- (quién lo creó y quién lo tocó por última vez). Cada UPDATE pisa al anterior,
-- así que diez modificaciones dejan una sola huella.
--
-- Esta bitácora es lo contrario: una fila por CADA acción, inmutable. Diez
-- ediciones son diez filas con el detalle de qué cambió en cada una; diez
-- consultas al mismo registro, diez filas.
--
-- Cómo se llena:
--   · Escrituras (INSERT/UPDATE/DELETE): sola, por el trigger genérico
--     `auditoria.auditar()` que instala `auditoria.activar_tabla()`. No depende
--     de que el backend se acuerde de registrar nada, ni se puede evitar desde
--     él, ni desde un script suelto contra la base.
--   · Lecturas y descargas: PostgreSQL NO dispara triggers en SELECT, así que
--     se registran explícitamente con `auditoria.registrar_evento()`.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auditoria;

-- ── ENUMs ────────────────────────────────────────────────────────────────────

-- Un ENUM y no un VARCHAR libre: una operación mal escrita desde un módulo de
-- negocio revienta en el acto en vez de ensuciar la bitácora con un valor que
-- nadie volverá a filtrar. Los tres primeros valores los escribe solo el
-- trigger; el resto los declaran los procedimientos y la API.
DO $$ BEGIN CREATE TYPE auditoria.enum_operacion AS ENUM (
    'INSERT',           -- Alta de un registro (fila completa en datos_despues)
    'UPDATE',           -- Modificación (solo el diff, en campos)
    'DELETE',           -- Borrado FÍSICO (fila completa en datos_antes)
    'BAJA',             -- Soft-delete: status TRUE -> FALSE
    'REACTIVACION',     -- Soft-delete revertido: status FALSE -> TRUE
    'LECTURA',          -- Acceso a información (no todo listado: ver README)
    'DESCARGA',         -- Entrega de un archivo / URL firmada
    'EXPORTACION',      -- Volcado masivo a Excel/PDF
    'LOGIN',            -- Inicio de sesión correcto
    'LOGIN_FALLIDO',    -- Credenciales inválidas o cuenta inactiva
    'ACCESO_DENEGADO'   -- 403 del guard, o credencial rechazada (reuso de token)
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabla ────────────────────────────────────────────────────────────────────

-- Tabla de EVENTO: no lleva el bloque de auditoría de fila
-- (`status`/`user_cr`/`token_cr`/`date_cr`/`user_up`/...) que exige
-- postgres/README.md para las tablas de entidad. Aquí sería un contrasentido:
-- `user_up`/`date_up` describen una modificación, y esta tabla no admite
-- ninguna; y un `status` daría la forma de OCULTAR una fila sin borrarla, que
-- es exactamente el agujero que la bitácora debe cerrar.
CREATE TABLE IF NOT EXISTS auditoria.log (
    id_log        BIGSERIAL PRIMARY KEY,

    -- ── Qué se tocó ──────────────────────────────────────────────────────────
    esquema       VARCHAR(63) NOT NULL,
    -- Tabla física ('users') o recurso lógico ('archivo', 'sesion'): las
    -- lecturas y descargas no siempre corresponden a una tabla.
    entidad       VARCHAR(63) NOT NULL,
    -- PK del registro COMO TEXTO: las PK de este sistema son INTEGER en unas
    -- tablas y UUID en otras (core.user_sessions, core.notifications). Un solo
    -- tipo textual las cubre a las dos sin dos columnas ni conversiones.
    id_registro   VARCHAR(80),

    -- ── Qué se hizo ──────────────────────────────────────────────────────────
    operacion     auditoria.enum_operacion NOT NULL,

    -- ── Quién ────────────────────────────────────────────────────────────────
    usuario_id    INTEGER,
    rol           VARCHAR(100),
    -- Desde qué dispositivo: `core.user_sessions.id`, el mismo `sid` del access
    -- token que el resto de tablas graba en `token_cr`/`token_up`. Sin esto la
    -- bitácora sabría QUIÉN actuó pero no desde dónde, que es justo la mitad
    -- que sirve cuando se investiga una credencial robada.
    sesion_id     UUID,

    -- ── A qué caso de negocio pertenece ──────────────────────────────────────
    -- Permite pedir "todo lo que pasó en el expediente X" atravesando todas sus
    -- tablas. En esta PLANTILLA no hay ningún agregado de negocio todavía, así
    -- que hoy es siempre NULL: es el punto de extensión que cada proyecto
    -- rellena mapeando aquí su agregado raíz (ver README del esquema).
    id_caso       VARCHAR(80),

    -- ── Qué cambió ───────────────────────────────────────────────────────────
    -- UPDATE -> solo el diff: {columna: {antes, despues}}.
    campos        JSONB,
    -- Fila completa: `datos_antes` en DELETE, `datos_despues` en INSERT.
    -- Ambos enmascarados (ver `auditoria.enmascarar`).
    datos_antes   JSONB,
    datos_despues JSONB,
    detalle       TEXT,

    -- ── Trazas HTTP ──────────────────────────────────────────────────────────
    -- La base nunca las conoce por su cuenta: las aporta el backend en el
    -- contexto de la transacción (ver backend/src/core/auditoria.ts).
    ip            VARCHAR(60),
    user_agent    VARCHAR(300),
    endpoint      VARCHAR(200),   -- 'PUT /users'

    -- Agrupa las filas producidas por una MISMA transacción: guardar un usuario
    -- con sus roles toca `users` y `user_roles` y deja varias filas que
    -- comparten txid. Sin esto, un cambio se leería como acciones sueltas.
    txid          BIGINT NOT NULL DEFAULT txid_current(),

    -- Epoch BIGINT como el resto del sistema (postgres/README.md). Pierde el
    -- subsegundo, así que dentro de un mismo segundo el orden lo desempata
    -- `id_log DESC` — y las filas de un mismo cambio, el `txid`.
    fecha         BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- ── Índices ──────────────────────────────────────────────────────────────────
-- Uno por PREGUNTA real, no uno por columna.

-- "Todo lo que le pasó al usuario 12" — la ficha de historial de un registro.
CREATE INDEX IF NOT EXISTS idx_auditoria_registro
    ON auditoria.log (esquema, entidad, id_registro, fecha DESC);

-- "Todo lo que hizo Fulano" — la investigación empieza casi siempre por aquí.
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario
    ON auditoria.log (usuario_id, fecha DESC);

-- "Todo lo que pasó en el caso X", atravesando todas sus tablas. PARCIAL:
-- mientras la plantilla no tenga agregado de negocio la columna es NULL en
-- todas las filas, y un índice completo sería puro peso muerto.
CREATE INDEX IF NOT EXISTS idx_auditoria_caso
    ON auditoria.log (id_caso, fecha DESC)
    WHERE id_caso IS NOT NULL;

-- "Solo los accesos denegados de la última semana" — filtro de la pantalla.
CREATE INDEX IF NOT EXISTS idx_auditoria_operacion ON auditoria.log (operacion, fecha DESC);

-- Línea de tiempo sin filtros: la vista por defecto del visor.
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha     ON auditoria.log (fecha DESC);

-- "Qué más pasó en el mismo cambio" — desde la ficha de un evento.
CREATE INDEX IF NOT EXISTS idx_auditoria_txid      ON auditoria.log (txid);

-- ── Inmutabilidad ────────────────────────────────────────────────────────────
-- Una bitácora editable no sirve como evidencia: si se puede corregir, lo que
-- dice no prueba nada. Solo se admite INSERT. Cualquier UPDATE, DELETE o
-- TRUNCATE aborta — también ejecutado a mano desde una consola con el usuario
-- de la aplicación, que es precisamente el caso que hay que cerrar.
--
-- Esto NO protege del superusuario de PostgreSQL, que puede quitar el trigger.
-- Lo que garantiza es que nadie borre evidencia por la vía normal ni por
-- descuido; el resto es cuestión de a quién se le da esa cuenta.
CREATE OR REPLACE FUNCTION auditoria.log_inmutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'La bitácora de auditoría no es editable (operación % rechazada)', TG_OP;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria.log;
CREATE TRIGGER trg_auditoria_inmutable
    BEFORE UPDATE OR DELETE ON auditoria.log
    FOR EACH ROW EXECUTE FUNCTION auditoria.log_inmutable();

-- TRUNCATE no dispara triggers de fila: necesita el suyo, a nivel de sentencia.
-- Sin él, `TRUNCATE auditoria.log` vaciaría la bitácora entera sin protesta.
DROP TRIGGER IF EXISTS trg_auditoria_no_truncate ON auditoria.log;
CREATE TRIGGER trg_auditoria_no_truncate
    BEFORE TRUNCATE ON auditoria.log
    FOR EACH STATEMENT EXECUTE FUNCTION auditoria.log_inmutable();
