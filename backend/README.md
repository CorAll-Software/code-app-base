# Backend · API Elysia (Bun)

API del núcleo: autenticación (access token JWT + refresh rotativo con sesiones
por dispositivo), usuarios, roles, permisos y auditoría.

## Requisitos

- [Bun](https://bun.sh) 1.3+
- PostgreSQL 18+ con el esquema `core` cargado (ver `../postgres/`)
- Redis / Valkey

## Arranque

```bash
cp example.env .env    # completar JWT_SECRET, credenciales de BD, S3 y Redis
bun install
bun run dev            # http://localhost:3000 · OpenAPI en /openapi
```

## Scripts

| Script | Descripción |
|--------|-------------|
| `bun run dev` | Servidor con hot-reload (`--watch`) |
| `bun run build` | Bundle de producción en `build/main.js` |
| `bun run start` | Ejecuta el bundle de producción |
| `bun run new-password` | Genera el hash bcrypt de una contraseña |
| `bun run tsc` | Chequeo de tipos sin emitir |

## Estructura

```
src/
├── index.ts           # Bootstrap Elysia: CORS, errores, OpenAPI, /api y /ws
├── config.ts          # Variables de entorno tipadas (única fuente de config)
├── router.ts          # Registro de rutas: núcleo + módulos de negocio
├── run-server.ts      # Tareas de arranque (conexiones, jobs programados)
├── core/              # Infraestructura transversal
│   ├── db/connection.ts        # Pool Bun SQL + execProcedure()
│   ├── auth.guard.ts           # Macro de autorización por permiso (JWT + RBAC)
│   ├── jwt.ts                  # Firma/verificación del access token (claim sid)
│   ├── session.ts              # Sesiones + refresh rotativo (core.user_sessions)
│   ├── permissions.ts          # Caché de permisos con respaldo en BD
│   ├── store.ts / redis.ts     # Caché en Redis (sesiones activas, permisos)
│   ├── auditoria.ts            # contextoAuditoria() + registrarEvento/Descarga
│   ├── s3.ts / image.ts        # Storage S3/MinIO + conversión WebP
│   ├── email/email-service.ts  # Nodemailer
│   └── permissions.constants.ts# Diccionario de slugs (gemelo del frontend)
└── modules/
    ├── core/          # auth, users, roles, permissions, notifications (+ auth.ws)
    │                  # notifications.helper.ts → createNotification() (BD + push WS)
    └── auditoria/     # auditoria.api.ts — consulta de la bitácora (solo GET)
```

## Cómo agregar un módulo

Ver `../docs/practicas.md` y `../docs/prompt-nuevo-modulo.md`.
Resumen: crear `src/modules/<modulo>/<modulo>.api.ts`, registrarlo en
`router.ts`, declarar sus slugs en `core/permissions.constants.ts` (y en el
gemelo del frontend + seed SQL), y protegido con el guard de permisos.
