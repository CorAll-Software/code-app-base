# App Base · Plantilla CorAll

Monorepo Bun workspaces + Turbo: `backend/` (Bun + Elysia + PostgreSQL + Redis),
`frontend/` (React 19 + AntD 6 + Vite + Zustand), `postgres/` (DDL + funciones SQL).

**Este es un proyecto PLANTILLA**: contiene solo el núcleo (auth JWT, usuarios,
roles, permisos RBAC, auditoría, notificaciones WS). Los proyectos reales se
crean copiándolo (ver `docs/checklist-nuevo-proyecto.md`).

## Comandos

- Backend: `cd backend && bun run dev` (:3000, OpenAPI en `/openapi`) · typecheck: `bun run tsc`
- Frontend: `cd frontend && bun run dev` (:5004) · build+typecheck: `bun run build`
- Lint: `bun run lint` en la raíz (Biome, un solo `biome.json` para los dos
  workspaces) · `bun run lint:fix` aplica lo autocorregible.
- Al cambiar dependencias de cualquier servicio: `bun run lockfile` en la raíz.
  Regenera `backend/bun.lock` y `frontend/bun.lock`, que son los que usan las
  imágenes de Docker (el de la raíz no se alcanza desde el contexto de build
  de cada carpeta). Si se olvida, el build de Docker falla, no pasa en silencio.
- BD: `psql -d app_base -f postgres/tables.sql` → `postgres/auditoria/install.sql`
  (reejecutable; va antes porque las funciones del núcleo lo invocan) →
  seeds/funciones en `postgres/core/`

## Reglas clave (detalle en docs/practicas.md)

- La lógica de negocio vive en **funciones PostgreSQL** `f(req json) RETURNS json`;
  el backend las llama con `execProcedure('esquema.funcion', [data])` y es capa delgada.
- Autorización declarativa en endpoints: `requirePermission: PERMISSIONS.X.Y`
  (macro de `backend/src/core/auth.guard.ts`).
- Permisos = slugs `modulo.accion` con **triple sincronización**:
  `backend/src/core/permissions.constants.ts` ↔ `frontend/src/core/permissions.constants.ts`
  ↔ `postgres/core/seed-permissions.sql`.
- Tablas de entidad: soft-delete con `status`, fechas epoch BIGINT, columnas de
  auditoría `user_cr/token_cr/date_cr` + `user_up/token_up/date_up` al final
  (`token_*` = `core.user_sessions.id`, el `sid` del token). Las tablas de evento
  (`notifications`, `password_recovery`, `user_sessions`) NO lo llevan.
  Ver `postgres/README.md`.
- Sesión: access token corto + refresh rotativo en `core.user_sessions`
  (`backend/src/core/session.ts`); todo `save_*` recibe `token_cr: user.sid`.
- Auditoría: bitácora inmutable `auditoria.log`, poblada por **un solo trigger
  genérico** — no se registra nada a mano. Toda función SQL que escriba abre con
  `PERFORM auditoria.contexto(req);` y cada endpoint mezcla
  `...contextoAuditoria(user, headers, 'PUT /x')` en el payload. Un esquema
  nuevo se activa con `SELECT auditoria.activar_esquema('<esquema>');`.
  Ver `postgres/auditoria/README.md`.
- Reporte de errores: Sentry autoalojado, **mismo DSN en los dos lados**
  (`SENTRY_DSN` / `VITE_SENTRY_DSN`); vacío = desactivado, como Cap. El backend
  usa un cliente propio sin dependencias (`core/sentry.ts`) y dice al arrancar
  si quedó activo; el frontend usa `@sentry/react` y nunca reporta en localhost.
  Lo que **no** entra en la bitácora: 404, errores de validación, 4xx, y los
  `RAISE EXCEPTION` de plpgsql (`P0001`) — son negocio, no defectos. Los fallos
  de BD se capturan en `execProcedure`, que es donde el error de pg aún conserva
  su código: los endpoints los convierten en 400 y nunca llegan al `onError`.
  Los sourcemaps del frontend los sube `@sentry/vite-plugin` al construir:
  `SENTRY_URL`/`SENTRY_ORG`/`SENTRY_PROJECT` en los `.env` del frontend y
  `SENTRY_AUTH_TOKEN` por fuera (ese **sí** es secreto, al revés que el DSN);
  faltando alguna, no sube nada y el build sigue. Bun carga `frontend/.env` en
  `process.env`, que gana sobre `.env.production` en `loadEnv` — por eso las
  tres públicas van comentadas en el `.env`.
- Frontend: HTTP solo vía `core/http.ts` (GET/POST tipados con toasts);
  rutas en `router.config.tsx` (lazy) + menú en `menu.config.tsx`, ambos con
  `slug`. Cada ruta lleva `errorElement`: el data router atrapa por su cuenta
  lo que revienta dentro de una ruta y sin él no llegaría a Sentry.
- Los servicios NUNCA rechazan: devuelven centinela (`[]` / `null` / `false`) y
  **el llamador lo comprueba antes de tocar el estado**. Un `await` que no lanzó
  no significa que haya funcionado (§4 de `docs/practicas.md`).
- Al agregar un módulo, seguir el checklist §6 de `docs/practicas.md`
  (BD → backend → frontend → activar la auditoría del esquema y comprobar
  la cobertura).
- No agregar dependencias sin necesidad real; imitar patrones de `modules/core`
  (backend) y `modules/equipo` (frontend) en lugar de inventar nuevos.
- Commits en formato [Conventional Commits](https://www.conventionalcommits.org):
  `<tipo>(alcance): <descripción en español>` (ver §7 de `docs/practicas.md`).
