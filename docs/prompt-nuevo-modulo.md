# Prompt — Crear / afinar un esquema de BD de un módulo

Copia el bloque de abajo y reemplaza `{{ESQUEMA}}`, `{{MODULO}}` y la lista de
entidades. Está calibrado con las convenciones reales de la plantilla (esquema
`core` y su auditoría). Es **solo de base de datos** (DDL + funciones SQL); no
cubre backend ni frontend. Pégalo a tu asistente para que genere el esquema con
la misma estructura.

---

```prompt
Vas a crear/afinar el esquema de base de datos `{{ESQUEMA}}` (módulo {{MODULO}})
de este proyecto, siguiendo EXACTAMENTE las convenciones existentes del esquema
`core`. Es trabajo SOLO de BASE DE DATOS (PostgreSQL 18+): DDL, ENUMs y
funciones SQL. No toques backend ni frontend. No inventes patrones nuevos:
imita los que ya están.

ENTIDADES A MODELAR:
- {{entidad_1}}: {{descripción breve}}
- {{entidad_2}}: {{descripción breve}}

═══════════════════════════════════════════════════════════════════════════════
1) ESTRUCTURA DE ARCHIVOS (no cambiar nombres ni ubicaciones)
═══════════════════════════════════════════════════════════════════════════════
- postgres/{{ESQUEMA}}/{{ESQUEMA}}-tables.sql   → DDL (tablas + ENUMs del esquema)
- postgres/{{ESQUEMA}}/{{ESQUEMA}}-tables.dbml  → diagrama ER autónomo (dbdiagram.io)
- postgres/{{ESQUEMA}}/<entidad>/*.sql          → funciones (get_*, save_*, delete_*, get_*_by_id)
- Propagar SIEMPRE los cambios de tabla al AGREGADO raíz:
  postgres/tables.sql  y  postgres/tables.dbml
- Si agregas/terminas el esquema, actualiza la tabla de estado en postgres/README.md.

═══════════════════════════════════════════════════════════════════════════════
2) CONVENCIONES DE TABLA (idénticas a core)
═══════════════════════════════════════════════════════════════════════════════
- PK: `id SERIAL PRIMARY KEY`.
- Toda tabla DE ENTIDAD termina con las columnas de auditoría EN ESTE ORDEN:
      status   BOOLEAN DEFAULT TRUE,   -- visible / soft-delete (hidden = FALSE)
      user_cr  INTEGER,
      token_cr UUID,                   -- sesión que la creó (core.user_sessions.id)
      date_cr  BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      user_up  INTEGER,
      token_up UUID,                   -- sesión que la modificó
      date_up  BIGINT
  El trío es quién + desde qué dispositivo + cuándo. `token_cr`/`token_up`
  guardan el `sid` del access token, que el backend manda SIEMPRE.
- EXCEPCIÓN — tablas de evento: las que no crea ni edita una persona desde una
  pantalla, sino un hecho del sistema (llega una notificación, alguien inicia
  sesión), NO llevan el bloque; describen su ciclo con columnas propias. Antes
  de copiarlo pregúntate: ¿puede esta fila haber sido creada por una sesión
  distinta de la que describe? Si la respuesta es no, sobra.
- Usa `enable BOOLEAN DEFAULT TRUE` (activo/inactivo) cuando la entidad se activa/desactiva.
- Fechas SIEMPRE en epoch `BIGINT` (no timestamp), salvo que imites algo existente.
- Montos `NUMERIC(12,2)`; pesos `NUMERIC(10,3)` (kg); metrajes `NUMERIC(8,2)`.
- Catálogos compartidos entre módulos viven en su propio esquema de maestros,
  no se duplican.
- FKs de auditoría (user_cr/user_up/token_cr/token_up) NO se declaran como
  REFERENCES (igual que core): son trazas históricas y deben sobrevivir al
  borrado del usuario o a la purga de sesiones.
- Nombres de tabla en snake_case plural en español (zonas, movimientos, clientes).

ENUMs (uno por concepto, prefijado por esquema, idempotente):
    DO $$ BEGIN CREATE TYPE {{ESQUEMA}}.enum_<concepto> AS ENUM ('A','B','C');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

Orden de creación: respeta dependencias de FK (una tabla referenciada se crea antes).
Crea índices para FKs y filtros frecuentes:
    CREATE INDEX IF NOT EXISTS idx_<tabla>_<col> ON {{ESQUEMA}}.<tabla> (<col>);

═══════════════════════════════════════════════════════════════════════════════
3) AUDITORÍA (a nivel de BD)
═══════════════════════════════════════════════════════════════════════════════
- NO crear bitácora propia por esquema: la auditoría es transversal en
  `auditoria.log` (inmutable: solo admite INSERT).
- NO escribir código para registrar cambios: los INSERT/UPDATE/DELETE los audita
  un ÚNICO trigger genérico. Basta con activarlo al terminar el esquema:
      SELECT auditoria.activar_esquema('{{ESQUEMA}}');
  Sin esa línea las tablas del módulo no aparecerán NUNCA en la bitácora, y esa
  ausencia se lee igual que "no pasó nada".
- Toda función que escriba declara su autor en la PRIMERA línea del cuerpo:
      PERFORM auditoria.contexto(req);
  Reconoce los nombres que ya usa el sistema (user_cr, token_cr…) y las trazas
  HTTP que mande la ruta. Si se omite, la auditoría sigue funcionando cayendo en
  user_cr/user_up de la propia fila; solo se pierde precisión.
- Lecturas y descargas: PostgreSQL no dispara triggers en SELECT. Si el módulo
  sirve accesos a información sensible o entrega archivos, regístralos con
      PERFORM auditoria.registrar_evento('<entidad>', 'LECTURA', _id::TEXT);
  Solo accesos reales, NO cada listado paginado.
- A nivel de fila, la trazabilidad mínima la dan SIEMPRE las columnas de auditoría
  (user_cr/token_cr/date_cr al insertar; user_up/token_up/date_up al actualizar).
  Toda función save_*/delete_* debe aceptar token_cr en el req json y grabarlo:
  el backend lo manda siempre como el sid del token.
- Detalle completo: postgres/auditoria/README.md

═══════════════════════════════════════════════════════════════════════════════
4) REGLAS DEL .dbml (para que renderice solo en dbdiagram.io)
═══════════════════════════════════════════════════════════════════════════════
- Encabezado: bloque `Project <proyecto>_{{ESQUEMA}} { database_type: 'PostgreSQL' Note: '…' }`.
- ENUMs multilínea (un valor por línea).
- Tipos con paréntesis van entre comillas: `"numeric(12,2)"`, `"numeric(8,2)"`.
- DEJA SIEMPRE un espacio antes de `[`:  `tipo enum.x [not null]` (nunca `enum.x[not null]`).
- Refs INTRA-esquema → `ref:` real:        `zona_id integer [ref: > {{ESQUEMA}}.tabla.id]`
- Refs CROSS-esquema → como NOTA (no ref):  `cliente_id integer [note: 'FK → maestros.clientes.id']`
- Cierra con `TableGroup {{ESQUEMA}} { … todas las tablas … }`.
- El AGREGADO raíz tables.dbml SÍ usa todos los `ref:` reales entre esquemas.

═══════════════════════════════════════════════════════════════════════════════
5) FUNCIONES SQL (patrón core — una por archivo en postgres/{{ESQUEMA}}/<entidad>/)
═══════════════════════════════════════════════════════════════════════════════
Firma única: reciben un solo `req json` y RETURNAN `json`. LANGUAGE plpgsql.
Toda función que ESCRIBA abre con `PERFORM auditoria.contexto(req);` (las de
solo lectura no lo necesitan).

-- get_<entidades>: lista (filtra status = TRUE, ordena id DESC)
CREATE OR REPLACE FUNCTION {{ESQUEMA}}.get_<entidades>(req json)
RETURNS json LANGUAGE plpgsql AS $function$
DECLARE result json;
BEGIN
    SELECT json_agg(t) INTO result FROM (
        SELECT e.id, e.<campos>, e.status, e.enable
        FROM {{ESQUEMA}}.<entidad> e
        WHERE e.status = TRUE
        ORDER BY e.id DESC
    ) t;
    RETURN COALESCE(result, '[]'::json);
END $function$;

-- save_<entidad>: UPSERT (id NULL/0 = insert, si no update con COALESCE)
CREATE OR REPLACE FUNCTION {{ESQUEMA}}.save_<entidad>(req json)
RETURNS json LANGUAGE plpgsql AS $function$
DECLARE
    v_id       INTEGER := (req->>'id')::INTEGER;
    v_user_cr  INTEGER := (req->>'user_cr')::INTEGER;
    v_token_cr UUID    := (req->>'token_cr')::UUID;
    -- v_<campo> := req->>'<campo>';  (cast según tipo)
    result json;
BEGIN
    PERFORM auditoria.contexto(req);   -- SIEMPRE la primera línea

    -- Validaciones de unicidad con RAISE EXCEPTION (mensaje claro en español):
    -- IF EXISTS (SELECT 1 FROM {{ESQUEMA}}.<entidad>
    --     WHERE <campo_unico> = v_<campo> AND status = TRUE AND (v_id IS NULL OR id != v_id))
    -- THEN RAISE EXCEPTION 'Ya existe … : %', v_<campo>; END IF;

    IF v_id IS NULL OR v_id = 0 THEN
        INSERT INTO {{ESQUEMA}}.<entidad> (<campos>, user_cr, token_cr)
        VALUES (<v_campos>, v_user_cr, v_token_cr) RETURNING id INTO v_id;
    ELSE
        UPDATE {{ESQUEMA}}.<entidad> SET
            <campo>  = COALESCE(v_<campo>, <campo>),
            status   = COALESCE((req->>'status')::BOOLEAN, status),
            user_up  = v_user_cr,
            token_up = v_token_cr,
            date_up  = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE id = v_id;
    END IF;

    SELECT json_build_object('id', e.id, '<campo>', e.<campo>, 'status', e.status)
    INTO result FROM {{ESQUEMA}}.<entidad> e WHERE e.id = v_id;
    RETURN result;
END $function$;

-- delete_<entidad>: SOFT delete (status = FALSE), nunca DELETE físico.
-- get_<entidad>_by_id: igual a get pero filtrando por (req->>'id').

═══════════════════════════════════════════════════════════════════════════════
6) ORDEN DE TRABAJO (afinar uno por uno)
═══════════════════════════════════════════════════════════════════════════════
1. Modela en {{ESQUEMA}}-tables.dbml (previsualiza en dbdiagram.io).
2. Refleja el DDL en {{ESQUEMA}}-tables.sql.
3. Propaga al agregado raíz tables.sql y tables.dbml.
4. Escribe funciones SQL en postgres/{{ESQUEMA}}/<entidad>/.
5. Marca el esquema en postgres/README.md.

ENTREGABLE: lista los archivos creados/editados y cualquier ref cross-schema nueva.
Antes de borrar/renombrar algo existente, AVISA el impacto (no rompas nada vivo).
```
