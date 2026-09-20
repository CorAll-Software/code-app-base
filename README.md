# App Base · Plantilla CorAll

> Proyecto base del stack nativo CorAll (**Bun + Elysia + PostgreSQL + React + Ant Design**)
> para arrancar nuevos proyectos en minutos con el núcleo funcional listo:
> **autenticación JWT, usuarios, roles, permisos (RBAC), auditoría y notificaciones**.

## Cómo usar esta plantilla

1. Copia el directorio (sin `node_modules` ni `.git`) al nuevo proyecto.
2. Sigue la guía paso a paso: **[`docs/checklist-nuevo-proyecto.md`](docs/checklist-nuevo-proyecto.md)**
   (renombrar, branding, `.env`, base de datos, primer usuario).
3. Para agregar módulos de negocio: **[`docs/practicas.md`](docs/practicas.md)** documenta
   las convenciones de punta a punta (BD → backend → frontend), y
   **[`docs/prompt-nuevo-modulo.md`](docs/prompt-nuevo-modulo.md)** es un prompt listo
   para generar el esquema de BD de un módulo con un asistente.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Bun + Elysia + PostgreSQL (Bun SQL) + Redis |
| Frontend | React 19 + TypeScript + Ant Design 6 + Vite + Zustand |
| Auth | JWT + `Bun.password` (bcrypt) + RBAC en Redis |
| Storage | S3-compatible (MinIO / AWS S3) |
| Email | Nodemailer |
| Infra | Docker (Dockerfiles de referencia en `backend/` y `frontend/`) |
| Monorepo | Bun workspaces + Turborepo |

## Estructura

```
app-base/
├── backend/                # API Elysia
│   └── src/
│       ├── config.ts       # Variables de entorno tipadas
│       ├── router.ts       # Registro de rutas (núcleo + módulos)
│       ├── core/           # db, jwt, auth.guard, captcha.guard, store(redis),
│       │                   # s3, email, auditoria, sentry
│       └── modules/
│           ├── core/       # auth, users, roles, permissions (+ WebSocket)
│           └── auditoria/  # consulta de la bitácora (solo GET)
├── frontend/               # SPA React
│   └── src/
│       ├── core/           # http, ws, permisos, colores, hooks, utilidades
│       ├── components/     # DataTable, StandardPageLayout, StandardModalForm, …
│       ├── layouts/        # login, home, perfil, 404, permission-route
│       ├── providers/      # AuthProvider, message provider
│       ├── menu.config.tsx / router.config.tsx
│       └── modules/
│           ├── equipo/         # Gestión de usuarios
│           ├── configuracion/  # Roles y permisos
│           └── auditoria/      # Visor de la bitácora
├── postgres/
│   ├── tables.sql          # Agregado: construye toda la BD
│   ├── core/               # DDL + funciones del núcleo + seed de permisos
│   └── auditoria/          # Bitácora inmutable + trigger genérico + install.sql
├── scripts/lockfile.ts     # Regenera backend/bun.lock y frontend/bun.lock (Docker)
├── biome.json              # Lint + formato, uno solo para los dos workspaces
└── docs/                   # Prácticas, checklist y prompts
```

## Qué incluye el núcleo

- **Login** con JWT de vida corta + **refresh token rotativo** con detección de
  reuso (+ WebSocket autenticado para sesión en vivo y notificaciones).
- **Sesiones activas**: el usuario ve sus dispositivos conectados desde su perfil
  y puede cerrarlos uno a uno o todos menos el actual (`core.user_sessions`).
- **Recuperación de contraseña** por correo (código de 6 dígitos).
- **Gestión de usuarios** (CRUD, foto de perfil vía S3, activar/desactivar, roles).
- **Roles y permisos**: árbol de permisos autogenerado desde los slugs, cache RBAC en Redis.
- **Auditoría**: bitácora inmutable (`auditoria.log`) poblada por un único
  trigger genérico — una fila por acción, con el diff de lo que cambió, los
  secretos enmascarados y las trazas de red. Visor con filtros, ficha de evento
  y estado de cobertura en el frontend.
- **Notificaciones** en tiempo real (campana + store Zustand).
- Componentes UI estándar: `DataTable`, `StandardPageLayout`, `StandardModalForm`,
  `StandardFilters`, avatares.

## Cómo levantar el proyecto

Requiere [Bun](https://bun.sh), PostgreSQL 18+ y Redis (o Valkey).

### 1. Base de datos

```bash
createdb app_base
psql -d app_base -f postgres/tables.sql

# Auditoría ANTES que las funciones: cada `save_*`/`delete_*` del núcleo abre con
# `PERFORM auditoria.contexto(req)`, así que ese esquema tiene que existir ya.
psql -d app_base -f postgres/auditoria/install.sql

psql -d app_base -f postgres/core/seed-permissions.sql
# Funciones del núcleo:
for f in postgres/core/*.sql postgres/core/notifications/*.sql postgres/core/sessions/*.sql; do
  psql -d app_base -f "$f"
done
```

> En Windows (PowerShell): `Get-ChildItem postgres/core -Recurse -Filter *.sql | ForEach-Object { psql -d app_base -f $_.FullName }`
>
> `install.sql` es **reejecutable**. Vuelve a correrlo al final —y cada vez que
> agregues un esquema— para activar los triggers de las tablas nuevas y ver su
> informe: qué funciones aún no declaran su autor y qué tablas quedan sin
> auditar. Compruébalo también con `auditoria.get_cobertura()`.

### 2. Backend

```bash
cd backend
cp example.env .env     # completar JWT_SECRET y credenciales (DB, S3, Redis)
bun install
bun run dev             # http://localhost:3000  ·  OpenAPI en /openapi
```

### 3. Frontend

```bash
cd frontend
bun install
bun run dev             # http://localhost:5004
```

También puedes usar Turbo desde la raíz: `bun install && bun run dev`.

## Comandos de la raíz

| Comando | Para qué |
|---|---|
| `bun run dev` / `bun run build` | Turbo sobre los dos workspaces |
| `bun run lint` / `bun run lint:fix` | Biome (un solo `biome.json` para ambos) |
| `bun run lockfile` | Regenera `backend/bun.lock` y `frontend/bun.lock` |

> `bun run lockfile` hay que correrlo **cada vez que cambien las dependencias de
> un servicio**: esos dos lockfiles son los que usan las imágenes de Docker (el
> de la raíz no se alcanza desde el contexto de build de cada carpeta). Si se
> olvida, el build de Docker falla — no pasa en silencio.

## Licencia

Privado — CorAll Development and Research SAC.
