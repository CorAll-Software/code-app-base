# Checklist — Arrancar un proyecto nuevo desde esta plantilla

Pasos para convertir `app-base` en un proyecto real. En orden.

## 1. Copiar y renombrar

- [ ] Copiar el directorio SIN `node_modules`, `.turbo`, `dist`, `build` ni `.git`.
- [ ] Buscar y reemplazar en todo el proyecto (respetando mayúsculas):
  - `app-base` → `mi-proyecto` (nombres de paquete en los 3 `package.json`)
  - `app_base` → `mi_proyecto` (nombre de BD en `backend/example.env`, `backend/src/config.ts`, `postgres/tables.dbml`)
  - `App Base` → `Mi Proyecto` (títulos en `frontend/index.html`, `site.webmanifest`)
- [ ] `git init` + commit inicial.

## 2. Branding

- [ ] `frontend/src/core/color.ts` → paleta `BRAND` (primary, secondary, header, sider).
- [ ] `frontend/index.html` → `<title>`, description, `theme-color`, Open Graph.
- [ ] `frontend/public/` → reemplazar `favicon.ico`, `favicon.svg`, `webp/logo.png`,
      `svg/empresa-logo.svg`, `email-logo.png` y `site.webmanifest`.
- [ ] `backend/assets/email-logo.png` → logo para correos.
- [ ] `frontend/src/layouts/home.page.tsx` y `login.tsx` → textos de bienvenida.

## 3. Configuración

- [ ] `backend/`: `cp example.env .env` y completar:
  - `JWT_SECRET` (generar uno fuerte: `openssl rand -base64 48`)
  - `DB_*` (PostgreSQL), `REDIS_URL`
  - `AWS_*` (S3/MinIO) y `EMAIL_*` si se usan desde el día 1
  - `TEAM_NAME` (aparece en correos y UI)
- [ ] `frontend/.env` ya apunta a localhost; completar `.env.production` / `.env.qas`
      con los dominios reales cuando existan.
- [ ] Revisar `timeZone` en `backend/src/config.ts` (por defecto `America/Lima`).

## 4. Base de datos

```bash
createdb mi_proyecto
psql -d mi_proyecto -f postgres/tables.sql
psql -d mi_proyecto -f postgres/core/seed-permissions.sql
# Todas las funciones del núcleo:
# (bash)  for f in $(find postgres/core -name '*.sql'); do psql -d mi_proyecto -f $f; done
# (pwsh)  Get-ChildItem postgres/core -Recurse -Filter *.sql | % { psql -d mi_proyecto -f $_.FullName }
```

- [ ] Crear el rol `Administrador` y el primer usuario:

```sql
INSERT INTO core.roles (name, description, is_system) VALUES ('Administrador', 'Acceso total', TRUE);
-- Hash de contraseña: cd backend && bun run new-password
INSERT INTO core.users (first_name, last_name, email, password_hash)
VALUES ('Admin', 'Sistema', 'admin@miempresa.com', '<hash>');
INSERT INTO core.user_roles (user_id, role_id) VALUES (1, 1);
```

## 5. Verificar el arranque

- [ ] `cd backend && bun install && bun run dev` → `http://localhost:3000` responde
      y `/openapi` carga.
- [ ] `cd frontend && bun install && bun run dev` → login en `http://localhost:5004`
      con el usuario admin.
- [ ] Crear un segundo usuario y un rol de prueba desde Ajustes → verificar que los
      permisos ocultan el menú correctamente.

## 6. Primer módulo de negocio

Seguir `docs/practicas.md` (checklist §6) y usar `docs/prompt-nuevo-modulo.md`
para generar el esquema de BD.
