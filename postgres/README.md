# `postgres/` — Estructura de la base de datos

Base de datos **PostgreSQL 18+** de la plantilla base CorAll. Organizada **por
esquema**, con `core` como base. Ver modelo en `tables.dbml`.

## Estructura de carpetas

```
postgres/
├─ README.md                       ← este archivo
├─ tables.sql                      ← AGREGADO: construye TODA la BD de una vez (orden FK)
├─ tables.dbml                     ← AGREGADO: diagrama ER completo (dbdiagram.io)
│
├─ core/                           ← Identidad y accesos (BASE)
│  ├─ core-tables.sql              ← DDL del esquema (tablas + ENUMs)
│  ├─ core-tables.dbml             ← Diagrama ER solo de este esquema
│  ├─ seed-permissions.sql         ← Seed idempotente del catálogo de permisos
│  ├─ *.sql                        ← Funciones del núcleo (get_users, save_user, …)
│  ├─ notifications/*.sql          ← Tablas y procedimientos de notificaciones
│  └─ sessions/*.sql               ← core.user_sessions + refresh token rotativo
│
├─ auditoria/                      ← Bitácora inmutable de acciones (BASE)
│  ├─ README.md                    ← Exclusiones, lecturas instrumentadas y límites
│  ├─ auditoria-tables.sql         ← Tabla `log` + ENUM + triggers de inmutabilidad
│  ├─ auditoria-tables.dbml        ← Diagrama ER solo de este esquema
│  ├─ contexto.sql                 ← contexto() + enmascarado de secretos
│  ├─ trigger.sql                  ← auditar(): UN solo trigger para todas las tablas
│  ├─ instalacion.sql              ← activar_tabla / activar_esquema / desactivar_tabla
│  ├─ eventos.sql                  ← registrar_evento(): lecturas y descargas
│  ├─ consultas.sql                ← get_log, get_registro, get_filtros, get_cobertura
│  ├─ install.sql                  ← Migración REEJECUTABLE (instala + activa + reporta)
│  └─ prueba.sql                   ← Prueba de aceptación de la bitácora
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

- PK: `id SERIAL PRIMARY KEY` (o `UUID PRIMARY KEY DEFAULT uuidv7()` cuando el id
  debe ser opaco; `uuidv7()` es nativo de PostgreSQL 18 y va ordenado en el tiempo,
  así que no fragmenta el índice como `gen_random_uuid()`).
- Toda tabla **de entidad** termina con las columnas de auditoría EN ESTE ORDEN:
  `status BOOLEAN DEFAULT TRUE` (soft-delete), `user_cr INTEGER`, `token_cr UUID`,
  `date_cr BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT`,
  `user_up INTEGER`, `token_up UUID`, `date_up BIGINT`.
  El par es **quién + desde qué sesión + cuándo**: `token_cr`/`token_up` guardan
  `core.user_sessions.id` (el `sid` del access token), de modo que cada fila se
  puede rastrear hasta el dispositivo concreto que la creó o modificó.
  > **Excepción — tablas de evento.** `core.notifications`,
  > `core.password_recovery` y `core.user_sessions` NO llevan el bloque: no las
  > crea ni edita un usuario desde una pantalla, sino un hecho del sistema
  > (llega una notificación, se pide un código, alguien inicia sesión). Ahí
  > `user_cr`/`token_cr` serían siempre el mismo valor que ya está en otra
  > columna, así que describen su ciclo de vida con columnas propias
  > (`date_cr`/`created_at`, `used_at`, `revoked_at`, `revoked_by_*`).
  > Antes de copiar el bloque, pregúntate: *¿puede esta fila haber sido creada
  > por una sesión distinta de la que describe?* Si la respuesta es no, sobra.
- `enable BOOLEAN DEFAULT TRUE` cuando la entidad se activa/desactiva.
- Fechas SIEMPRE en epoch `BIGINT` (no timestamp).
- Montos `NUMERIC(12,2)`.
- FKs de auditoría (`user_cr`/`user_up`/`token_cr`/`token_up`) NO se declaran
  como `REFERENCES`: son trazas históricas y deben sobrevivir al borrado del
  usuario o a la purga de sesiones.
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

## Permisos efectivos

`core.get_user_permissions(req json)` es la **única** definición de qué puede
hacer un usuario: devuelve el array de slugs, aplicando el bypass de los roles
de sistema. La usan `core.get_user_login_data` (payload de sesión) y el backend
para recargar la caché de Redis, así que la regla no se duplica en dos sitios.

`core.list_users_by_role(req json)` devuelve los ids con un rol asignado. Es lo
que permite invalidar la caché de los afectados al editar ese rol.

## Auditoría (a nivel de BD)

Detalle completo en [`auditoria/README.md`](auditoria/README.md). Lo esencial:

- NO crear bitácora propia por esquema: la auditoría es transversal en
  `auditoria.log`, **inmutable** (solo INSERT; UPDATE, DELETE y TRUNCATE abortan
  por trigger).
- **No hay que registrar nada a mano.** Las escrituras las audita un **único**
  trigger genérico que se instala por generación:
  ```sql
  SELECT auditoria.activar_esquema('ventas');   -- al agregar un esquema
  ```
  Sin esa línea, las tablas del módulo no aparecerán NUNCA en la bitácora, y esa
  ausencia se lee igual que "no pasó nada". `auditoria.get_cobertura()` lo delata.
- Toda función que escriba **declara su autor en la primera línea**:
  ```sql
  PERFORM auditoria.contexto(req);
  ```
  Reconoce los nombres que ya usa el sistema (`user_cr`, `token_cr`, …) y las
  trazas HTTP que mande la ruta. Es `SET LOCAL`: vive lo que dura la transacción
  implícita de la llamada, así que no se filtra entre peticiones del pool.
  Si se omite, la auditoría sigue funcionando cayendo en `user_cr`/`user_up` de
  la propia fila; solo se pierde precisión.
- Las **lecturas y descargas** no las ve ningún trigger (PostgreSQL no los
  dispara en SELECT): se registran con `auditoria.registrar_evento(...)`.
- A nivel de fila, la trazabilidad mínima la dan las columnas de auditoría:
  `user_cr`/`token_cr`/`date_cr` al insertar; `user_up`/`token_up`/`date_up` al
  actualizar. Toda función `save_*`/`delete_*` debe aceptar `token_cr` en el
  `req json` y grabarlo — el backend lo manda siempre como `(user as any).sid`.

## Sesiones (`core/sessions/`)

`core.user_sessions` es una fila por dispositivo con sesión abierta. Su `id`
(UUID v7) es a la vez el `sid` del access token y el `token_cr`/`token_up` del
resto de tablas. Del refresh token solo se guarda `SHA-256(secreto)`, y cada
renovación lo rota: si llega un secreto ya rotado se asume robo y
`core.rotate_user_session` revoca la sesión entera (`REUSE_DETECTED`).

Es una **tabla de evento**, sin bloque de auditoría (ver la excepción arriba).
Su ciclo de vida se lee así:

| Columna | Significado |
|---|---|
| `date_cr` | Cuándo se abrió (el login). |
| `last_used_at` | Última renovación del refresh token. |
| `expires_at` | Hasta cuándo vale; se extiende en cada renovación. |
| `revoked_at` | Cuándo se cerró. `NULL` = activa. |
| `revoked_reason` | Por qué. `NULL` con `revoked_at` = venció sola. |
| `revoked_by_user` / `revoked_by_session` | **Quién** la cerró y **desde qué dispositivo**: el propio usuario desde otra sesión, o el administrador que lo forzó. `NULL` en cierres automáticos. |

Una sesión está activa si `revoked_at IS NULL AND expires_at > now`; no hay
columna `status` que pueda contradecir a `revoked_at`.

Funciones: `create_user_session`, `rotate_user_session`, `get_user_session`
(una), `get_user_sessions` (activas del usuario), `revoke_user_session`,
`revoke_user_sessions` (con `except_id`) y `purge_user_sessions` (job de
limpieza). Las del flujo de login devuelven `{ "error": … }` dentro del JSON en
vez de `RAISE`, para que el backend distinga un 401 de un fallo de BD.

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
   `backend/src/modules/<schema>/`. Cada función que escriba empieza con
   `PERFORM auditoria.contexto(req);`.
5. Agrega sus permisos a `core/seed-permissions.sql`.
6. **Activa la auditoría del esquema**: `SELECT auditoria.activar_esquema('<schema>');`
   (o vuelve a correr `auditoria/install.sql`, que barre todos los esquemas).
   Compruébalo con `auditoria.get_cobertura()`: una tabla en `false` no dejará
   rastro jamás.
7. Actualiza la tabla de estado de este README.

## Estado de los esquemas

| Esquema | `*-tables.sql` | `*-tables.dbml` | Afinado |
|---|---|---|---|
| core | ✅ | ✅ | ✅ |
| auditoria | ✅ | ✅ | ✅ |
