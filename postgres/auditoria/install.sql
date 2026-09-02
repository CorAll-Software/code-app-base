-- =============================================================================
-- MIGRACIÓN: módulo de auditoría · instalación completa y REEJECUTABLE
--
--   psql -d app_base -f postgres/auditoria/install.sql
--
-- Idempotente: se puede volver a ejecutar tantas veces como haga falta sin
-- perder datos. La tabla se crea con IF NOT EXISTS, las funciones son CREATE OR
-- REPLACE y los triggers se reinstalan (DROP + CREATE), que es justo lo que hay
-- que hacer cuando aparece una tabla nueva.
--
-- Qué deja instalado:
--   1. El esquema `auditoria` y la tabla `log` (solo INSERT: UPDATE, DELETE y
--      TRUNCATE abortan por trigger).
--   2. `auditoria.contexto()`, con la que cada función de negocio declara quién
--      está actuando, y el enmascarado de secretos.
--   3. `auditoria.auditar()`, el trigger genérico, y las funciones que lo
--      instalan, lo retiran y reportan su cobertura.
--   4. Las funciones de eventos (lecturas/descargas) y de consulta.
--   5. El trigger sobre TODAS las tablas de `core` y de los esquemas de negocio
--      que existan, salvo las excluidas a propósito.
--
-- ATENCIÓN: crear los triggers toma un bloqueo exclusivo breve sobre cada
-- tabla. En una base con carga, ejecutar en ventana de mantenimiento.
--
-- Usa `\ir` (include relative a ESTE archivo), así que hay que ejecutarlo con
-- psql. Desde otro cliente (DBeaver, pgAdmin) hay que aplicar a mano los seis
-- archivos en el orden de abajo — que es su orden de dependencias.
-- =============================================================================

BEGIN;

\ir auditoria-tables.sql
\ir contexto.sql
\ir trigger.sql
\ir instalacion.sql
\ir eventos.sql
\ir consultas.sql

-- =============================================================================
-- ACTIVACIÓN
-- =============================================================================
-- Se recorren los esquemas de la aplicación que EXISTAN. Los de negocio se
-- descubren solos: cualquier esquema que no sea del sistema entra, así que un
-- proyecto derivado de la plantilla no tiene que tocar este archivo.
DO $migracion$
DECLARE
    _esquema TEXT;
    _r       JSON;
BEGIN
    FOR _esquema IN
        SELECT nspname
          FROM pg_namespace
         WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'auditoria', 'public')
           AND nspname NOT LIKE 'pg_%'
         ORDER BY nspname
    LOOP
        _r := auditoria.activar_esquema(_esquema);
        RAISE NOTICE 'Auditoría activada en %: % tablas (omitidas: %)',
            _esquema, _r ->> 'total', _r ->> 'omitidas';
    END LOOP;
END;
$migracion$;

-- Deja constancia de la propia instalación: es el primer evento que va a
-- contener la bitácora, y sirve para fechar desde cuándo hay cobertura. Una
-- bitácora que empieza sin marca no permite distinguir "no pasó nada antes" de
-- "antes no se estaba auditando".
SELECT auditoria.registrar_evento(
    _entidad   => 'instalacion',
    _operacion => 'INSERT',
    _detalle   => 'Instalación/actualización del módulo de auditoría',
    _esquema   => 'auditoria'
);

COMMIT;

-- =============================================================================
-- VERIFICACIÓN — qué falta por completar
-- =============================================================================
-- Se devuelven como CONSULTAS y no como RAISE NOTICE para que se vean desde
-- cualquier cliente, no solo desde la consola de psql.

-- 1. Funciones que ESCRIBEN y todavía NO declaran su autor.
--    Sin contexto la auditoría sigue funcionando (el trigger cae en `user_cr` /
--    `user_up` de la propia fila), pero se pierde precisión: los borrados en
--    cascada, las tablas sin esas columnas, la sesión y la ip.
--    Si no devuelve filas, no queda nada por instrumentar.
SELECT n.nspname  AS esquema,
       p.proname  AS funcion,
       'falta PERFORM auditoria.contexto(req) al entrar' AS pendiente
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'auditoria', 'public')
   AND n.nspname NOT LIKE 'pg_%'
   AND p.prokind = 'f'
   AND p.prosrc ~* '(INSERT[[:space:]]+INTO|UPDATE[[:space:]]+[a-z_]+\.|DELETE[[:space:]]+FROM)'
   AND p.prosrc NOT LIKE '%auditoria.contexto%'
   -- Solo escriben en tablas EXCLUIDAS de la auditoría, así que declarar el
   -- contexto no cambiaría nada: no hay trigger que lo lea. Lo que en esas
   -- tablas sí es una acción ya se registra con `auditoria.registrar_evento`.
   AND p.proname NOT IN (
        'purge_user_sessions',              -- limpieza de sesiones vencidas (job)
        'create_notification',              -- core.notifications
        'mark_notification_as_read',
        'mark_all_notifications_as_read',
        'request_password_recovery',        -- core.password_recovery
        'validate_recovery_code'
   )
 ORDER BY 1, 2;

-- 2. Cobertura: qué tablas tienen trigger y cuántos eventos llevan.
--    Una tabla en `auditada = false` NUNCA aparecerá en la bitácora, y esa
--    ausencia se lee igual que "no pasó nada". Es la consulta a repasar cada
--    vez que se agrega un módulo.
SELECT jsonb_pretty(auditoria.get_cobertura()::jsonb);
