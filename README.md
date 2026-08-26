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
│       ├── core/           # db, jwt, auth.guard, store(redis), s3, email, audit
│       └── modules/
│           └── core/       # auth, users, roles, permissions (+ WebSocket)
├── frontend/               # SPA React
│   └── src/
│       ├── core/           # http, ws, permisos, colores, hooks, utilidades
│       ├── components/     # DataTable, StandardPageLayout, StandardModalForm, …
│       ├── layouts/        # login, home, perfil, 404, permission-route
│       ├── providers/      # AuthProvider, message provider
│       ├── menu.config.tsx / router.config.tsx
│       └── modules/
│           ├── equipo/         # Gestión de usuarios
│           └── configuracion/  # Roles y permisos + auditoría
├── postgres/
│   ├── tables.sql          # Agregado: construye toda la BD
│   └── core/               # DDL + funciones del núcleo + seed de permisos
└── docs/                   # Prácticas, checklist y prompts
```

## Qué incluye el núcleo

- **Login** con JWT (+ WebSocket autenticado para sesión en vivo y notificaciones).
- **Recuperación de contraseña** por correo (código de 6 dígitos).
- **Gestión de usuarios** (CRUD, foto de perfil vía S3, activar/desactivar, roles).
- **Roles y permisos**: árbol de permisos autogenerado desde los slugs, cache RBAC en Redis.
- **Auditoría** transversal (`core.audit_log`) con visor en el frontend.
- **Notificaciones** en tiempo real (campana + store Zustand).
- Componentes UI estándar: `DataTable`, `StandardPageLayout`, `StandardModalForm`,
  `StandardFilters`, avatares.

## Cómo levantar el proyecto

Requiere [Bun](https://bun.sh), PostgreSQL 15+ y Redis (o Valkey).

### 1. Base de datos

```bash
createdb app_base
psql -d app_base -f postgres/tables.sql
psql -d app_base -f postgres/core/seed-permissions.sql
# Funciones del núcleo:
for f in postgres/core/*.sql postgres/core/audit/*.sql postgres/core/notifications/*.sql; do
  psql -d app_base -f "$f"
done
```

> En Windows (PowerShell): `Get-ChildItem postgres/core -Recurse -Filter *.sql | ForEach-Object { psql -d app_base -f $_.FullName }`

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

## Licencia

Privado — CorAll Development and Research SAC.
