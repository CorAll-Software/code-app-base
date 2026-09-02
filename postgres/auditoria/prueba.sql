-- =============================================================================
-- PRUEBA DE ACEPTACIÓN del módulo de auditoría
--
--   psql -d app_base -f postgres/auditoria/prueba.sql
--
-- Requiere el módulo ya instalado (postgres/auditoria/install.sql).
--
-- Comprueba las cinco cosas que tienen que ser ciertas para que la bitácora
-- sirva como evidencia:
--   1. Un alta se registra entera.
--   2. Una modificación registra SOLO lo que cambió, y un UPDATE que no cambia
--      nada observable no deja fila.
--   3. Una baja lógica se distingue de una modificación cualquiera.
--   4. Una descarga (que ningún trigger puede ver) queda registrada.
--   5. La bitácora NO se puede editar, ni siquiera desde esta consola.
--
-- AVISO: deja un usuario de prueba (correo prueba.auditoria@local) dado de baja
-- y sus filas en la bitácora. Las filas NO se pueden borrar — es exactamente lo
-- que demuestra la prueba 5. Ejecutar en desarrollo, no en producción.
-- =============================================================================

\set ON_ERROR_STOP off
\timing off

-- ─────────────────────────────────────────────────────────────────────────────
-- Punto de partida: se anota el último id para leer después solo lo nuevo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _t_prueba AS
SELECT COALESCE(MAX(id_log), 0) AS desde_id FROM auditoria.log;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. INSERT — el alta guarda la fila completa, con la contraseña enmascarada
-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '=== 1. INSERT ==============================================='
\echo 'Esperado: operacion=INSERT · usuario_id=1 · datos_despues con la fila'
\echo '          completa y password_hash = "***" · ip y endpoint presentes.'
\echo ''

SELECT core.save_user(json_build_object(
    'first_name',    'Prueba',
    'last_name',     'Auditoría',
    'email',         'prueba.auditoria@local',
    'password_hash', 'hash-secreto-que-no-debe-aparecer',
    'cargo',         'Analista',
    -- Contexto: es lo que el backend manda en cada llamada
    -- (contextoAuditoria en backend/src/core/auditoria.ts).
    'user_cr',       1,
    'ip',            '203.0.113.10',
    'user_agent',    'psql/prueba',
    'endpoint',      'POST /users'
));

SELECT operacion,
       entidad,
       usuario_id,
       ip,
       endpoint,
       datos_despues ->> 'password_hash' AS password_en_bitacora,
       datos_despues ->> 'email'         AS email_en_bitacora
  FROM auditoria.log
 WHERE id_log > (SELECT desde_id FROM _t_prueba)
   AND entidad = 'users'
 ORDER BY id_log;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. UPDATE parcial — solo el diff, y un UPDATE sin cambios no deja fila
-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '=== 2. UPDATE parcial ======================================='
\echo 'Esperado: UNA sola fila nueva, operacion=UPDATE, campos con SOLO cargo'
\echo '          y phone ({antes, despues}), detalle = "cargo, phone".'
\echo '          El segundo guardado (idéntico) NO debe añadir ninguna fila:'
\echo '          reescribir los mismos valores no es una acción.'
\echo ''

CREATE TEMP TABLE _t_marca AS SELECT COALESCE(MAX(id_log), 0) AS m FROM auditoria.log;

-- Cambio real de dos campos
SELECT core.save_user(json_build_object(
    'id',      (SELECT id FROM core.users WHERE email = 'prueba.auditoria@local'),
    'cargo',   'Analista Senior',
    'phone',   '999888777',
    'user_cr', 1,
    'ip',      '203.0.113.10',
    'endpoint','PUT /users'
));

-- Exactamente lo mismo otra vez: no cambia nada observable.
SELECT core.save_user(json_build_object(
    'id',      (SELECT id FROM core.users WHERE email = 'prueba.auditoria@local'),
    'cargo',   'Analista Senior',
    'phone',   '999888777',
    'user_cr', 1,
    'ip',      '203.0.113.10',
    'endpoint','PUT /users'
));

SELECT operacion, detalle, jsonb_pretty(campos) AS diff
  FROM auditoria.log
 WHERE id_log > (SELECT m FROM _t_marca) AND entidad = 'users'
 ORDER BY id_log;

\echo '--> Filas nuevas (debe ser EXACTAMENTE 1):'
SELECT COUNT(*) AS filas_nuevas
  FROM auditoria.log
 WHERE id_log > (SELECT m FROM _t_marca) AND entidad = 'users';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. BAJA — el soft-delete no se confunde con una modificación
-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '=== 3. BAJA ================================================='
\echo 'Esperado: operacion = BAJA (no UPDATE), con status en el diff.'
\echo ''

DROP TABLE _t_marca;
CREATE TEMP TABLE _t_marca AS SELECT COALESCE(MAX(id_log), 0) AS m FROM auditoria.log;

SELECT core.delete_user(json_build_object(
    'id',      (SELECT id FROM core.users WHERE email = 'prueba.auditoria@local'),
    'user_cr', 1,
    'ip',      '203.0.113.10',
    'endpoint','DELETE /users/:id'
));

SELECT operacion, detalle, jsonb_pretty(campos) AS diff
  FROM auditoria.log
 WHERE id_log > (SELECT m FROM _t_marca) AND entidad = 'users'
 ORDER BY id_log;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. DESCARGA — lo que ningún trigger puede ver
-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '=== 4. DESCARGA ============================================='
\echo 'Esperado: una fila con operacion=DESCARGA. PostgreSQL no dispara'
\echo '          triggers en SELECT, así que esta la declara la aplicación.'
\echo ''

SELECT auditoria.registrar_evento_req(json_build_object(
    'entidad',     'archivo',
    'operacion',   'DESCARGA',
    'id_registro', 'informe-2026.pdf',
    'user_cr',     1,
    'detalle',     'Descarga de informe desde la prueba de aceptación',
    'ip',          '203.0.113.10',
    'user_agent',  'psql/prueba',
    'endpoint',    'GET /archivos/informe-2026.pdf'
));

SELECT operacion, entidad, id_registro, usuario_id, ip, detalle
  FROM auditoria.log
 WHERE id_log > (SELECT desde_id FROM _t_prueba)
   AND operacion = 'DESCARGA';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. INMUTABILIDAD — la bitácora no se edita, y punto
-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '=== 5. INMUTABILIDAD ========================================'
\echo 'Esperado: las TRES sentencias fallan con'
\echo '  ERROR: La bitácora de auditoría no es editable (operación X rechazada)'
\echo 'Si alguna pasa, la bitácora no sirve como evidencia.'
\echo ''

UPDATE auditoria.log SET detalle = 'manipulado' WHERE id_log = (SELECT MAX(id_log) FROM auditoria.log);
DELETE FROM auditoria.log WHERE id_log = (SELECT MAX(id_log) FROM auditoria.log);
TRUNCATE auditoria.log;

-- ═════════════════════════════════════════════════════════════════════════════
-- Resumen
-- ═════════════════════════════════════════════════════════════════════════════
\echo ''
\echo '=== RESUMEN ================================================='
\echo 'Filas dejadas por esta prueba (todas deben seguir ahí):'
\echo ''

SELECT id_log, operacion, esquema || '.' || entidad AS tabla, id_registro,
       usuario_id, detalle, txid,
       to_char(to_timestamp(fecha), 'DD/MM/YYYY HH24:MI:SS') AS momento
  FROM auditoria.log
 WHERE id_log > (SELECT desde_id FROM _t_prueba)
 ORDER BY id_log;

\echo ''
\echo 'Cobertura actual (una tabla en false NUNCA aparecerá en la bitácora):'
SELECT jsonb_pretty(auditoria.get_cobertura()::jsonb);
