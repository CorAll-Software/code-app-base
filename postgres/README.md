# `postgres/` — Estructura de la base de datos

Base de datos **PostgreSQL 15+** de la plantilla base CorAll. Organizada **por
esquema**, con `core` como base. Ver modelo en `tables.dbml`.

## Estructura de carpetas

```
postgres/
├─ README.md                       ← este archivo
├─ tables.sql                      ← AGREGADO: construye TODA la BD de una vez (orden FK)
├─ tables.dbml                     ← AGREGADO: diagrama ER completo (dbdiagram.io)
│
├─ core/                           ← Identidad, accesos, auditoría (BASE)
│  ├─ core-tables.sql              ← DDL del esquema (tablas + ENUMs)
│  ├─ core-tables.dbml             ← Diagrama ER solo de este esquema
│  ├─ seed-permissions.sql         ← Seed idempotente del catálogo de permisos
│  ├─ *.sql                        ← Funciones del núcleo (get_users, save_user, …)
│  ├─ audit/*.sql                  ← save_audit_log, get_audit_logs
│  └─ notifications/*.sql          ← Tablas y procedimientos de notificaciones
│
└─ <esquema>/                      ← Un directorio por esquema de negocio
   ├─ <esquema>-tables.sql         ← DDL del esquema
   ├─ <esquema>-tables.dbml        ← Diagrama ER del esquema
   └─ <entidad>/*.sql              ← Funciones (get_*, save_*, delete_*, get_*_by_id)
```

Cada esquema tiene **dos artefactos de definición**, nombrados `[esquema]-tables.*`:

| Archivo | Para qué |
|---|---|
| `<schema>/<schema>-tables.sql` | DDL ejecutable (tablas + ENUMs del esquema). |
| `<schema>/<schema>-tables.dbml` | Diagrama ER del esquema, para previsualizar/afinar en [dbdiagram.io](https://dbdiagram.io). |

> Los archivos raíz mantienen el nombre `tables.sql` / `tables.dbml` (sin prefijo)
> porque son el **agregado**, no un esquema.

Los **archivos raíz** (`tables.sql`, `tables.dbml`) son el **agregado** de todos los
esquemas: sirven para construir/visualizar la BD completa. Se mantienen en sync
manualmente al afinar cada esquema (ver «Flujo de trabajo»).

## Convenciones de tabla (obligatorias)

- PK: `id SERIAL PRIMARY KEY`.
- Toda tabla termina con las columnas de auditoría EN ESTE ORDEN:
  `status BOOLEAN DEFAULT TRUE` (soft-delete), `user_cr INTEGER`,
  `date_cr BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT`,
  `user_up INTEGER`, `date_up BIGINT`.
- `enable BOOLEAN DEFAULT TRUE` cuando la entidad se activa/desactiva.
- Fechas SIEMPRE en epoch `BIGINT` (no timestamp).
- Montos `NUMERIC(12,2)`.
- FKs de auditoría (`user_cr`/`user_up`) NO se declaran como `REFERENCES`.
- Nombres de tabla en snake_case plural en español.
- ENUMs: uno por concepto, prefijado por esquema, idempotente
  (`DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`).
- Índices para FKs y filtros frecuentes (`CREATE INDEX IF NOT EXISTS idx_<tabla>_<col> ...`).

## Funciones SQL (patrón core)

Firma única: reciben un solo `req json` y retornan `json`, `LANGUAGE plpgsql`.
Una función por archivo en `<schema>/<entidad>/`:

- `get_<entidades>` — lista (filtra `status = TRUE`, ordena `id DESC`), retorna `COALESCE(json_agg(t), '[]')`.
- `save_<entidad>` — UPSERT: `id` NULL/0 → INSERT; si no, UPDATE con `COALESCE` campo a campo. Valida unicidad con `RAISE EXCEPTION` (mensaje claro en español).
- `delete_<entidad>` — SOFT delete (`status = FALSE`), nunca `DELETE` físico.
- `get_<entidad>_by_id` — igual a get pero filtrando por `(req->>'id')`.

## Auditoría (a nivel de BD)

- NO crear bitácora propia por esquema: la auditoría es transversal en
  `core.audit_log` (inmutable), poblada con `core.save_audit_log(req json)`.
- Cada operación crítica se registra con: `user_id`, `module` (valor de
  `core.enum_module`), `table_name`, `record_id`, `action`, `old_data`/`new_data`
  (JSONB) e `ip_address`.
- A nivel de fila, la trazabilidad mínima la dan las columnas de auditoría
  (`user_cr`/`date_cr` al insertar; `user_up`/`date_up` al actualizar).

## Reglas del `.dbml` por esquema

Para que cada archivo **renderice de forma autónoma** en dbdiagram.io:

- **Referencias dentro del mismo esquema** → usar `ref:` real.
- **Referencias a OTRO esquema** → NO usar `ref:` (la tabla destino no está en el
  archivo). Documentarla como nota: `cliente_id integer [note: 'FK → ventas.clientes.id']`.
- Tipos con paréntesis van entre comillas: `"numeric(12,2)"`.
- Dejar SIEMPRE un espacio antes de `[`: `tipo enum.x [not null]`.
- Cerrar con `TableGroup <esquema> { … }`.
- El **agregado** `tables.dbml` (raíz) sí usa todos los `ref:` reales entre esquemas.

## Flujo de trabajo (agregar un esquema de negocio)

1. Modela el esquema en `<schema>/<schema>-tables.dbml` (previsualiza en dbdiagram.io).
2. Refleja el DDL final en `<schema>/<schema>-tables.sql`.
3. Propaga los cambios al **agregado** raíz `tables.sql` y `tables.dbml`.
4. Implementa funciones en `<schema>/<entidad>/*.sql` y el módulo de backend
   `backend/src/modules/<schema>/`.
5. Agrega el valor del módulo a `core.enum_module` y sus permisos a
   `core/seed-permissions.sql`.
6. Actualiza la tabla de estado de este README.

## Estado de los esquemas

| Esquema | `*-tables.sql` | `*-tables.dbml` | Afinado |
|---|---|---|---|
| core | ✅ | ✅ | ✅ |
