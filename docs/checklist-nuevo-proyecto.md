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
  - `JWT_ACCESS_EXPIRE_IN` / `JWT_REFRESH_EXPIRE_IN` (vida del access token y de
    la sesión; 15 min / 7 días por defecto)
  - `DB_*` (PostgreSQL 18+, se usa `uuidv7()` nativo), `REDIS_URL`
  - `AWS_*` (S3/MinIO) y `EMAIL_*` si se usan desde el día 1
  - `TEAM_NAME` (aparece en correos y UI)
- [ ] `frontend/.env` ya apunta a localhost; completar `.env.production` / `.env.qas`
      con los dominios reales cuando existan.
- [ ] **CAPTCHA (Cap)**: crear un site key en la instancia de Cap y completar
  - `CAP_API_ENDPOINT` + `CAP_SECRET_KEY` en `backend/.env`
  - `VITE_CAP_API_ENDPOINT` en los `.env` del frontend (mismo endpoint público,
    **con barra final**: `https://<instancia-cap>/<site-key>/`)
  - Mientras queden vacíos el CAPTCHA está desactivado (el backend lo avisa al
    arrancar); definirlos antes de salir a producción.
- [ ] **Reporte de errores (Sentry)**: crear el proyecto en la instancia
      autoalojada y usar **el mismo DSN en los dos lados** (no es un secreto:
      viaja en cada petición del navegador y solo autoriza a enviar).
  - `SENTRY_DSN` en `backend/.env` — **a mano en cada servidor**: `.env` está en
    gitignore, así que el DSN no viaja con el despliegue y es lo que más se
    olvida. El backend dice al arrancar si quedó activo o no; si no lo dice,
    no está reportando.
  - `VITE_SENTRY_DSN` en `frontend/.env.production` y `.env.qas` — estos sí se
    versionan, así que basta ponerlo una vez.
  - Vacío = desactivado. En `localhost` nunca se activa, y el backend tampoco
    reporta con `SENTRY_ENVIRONMENT=development`.
- [ ] Revisar `timeZone` en `backend/src/config.ts` (por defecto `America/Lima`).

## 4. Base de datos

```bash
createdb mi_proyecto
psql -d mi_proyecto -f postgres/tables.sql

# Auditoría ANTES que las funciones del núcleo: cada save_*/delete_* abre con
# `PERFORM auditoria.contexto(req)`, así que ese esquema debe existir ya.
psql -d mi_proyecto -f postgres/auditoria/install.sql

psql -d mi_proyecto -f postgres/core/seed-permissions.sql
# Todas las funciones del núcleo:
# (bash)  for f in $(find postgres/core -name '*.sql'); do psql -d mi_proyecto -f $f; done
# (pwsh)  Get-ChildItem postgres/core -Recurse -Filter *.sql | % { psql -d mi_proyecto -f $_.FullName }

# Reejecutar al final (es idempotente): activa los triggers de las tablas nuevas
# y reporta qué funciones aún no declaran su autor.
psql -d mi_proyecto -f postgres/auditoria/install.sql
```

- [ ] Comprobar la cobertura: ninguna tabla del proyecto debe quedar en `false`
      salvo las excluidas a propósito (ver `postgres/auditoria/README.md`).

```sql
SELECT jsonb_pretty(auditoria.get_cobertura()::jsonb);
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
- [ ] Perfil → **Sesiones**: entrar desde otro navegador, comprobar que aparecen
      las dos sesiones y que «Cerrar las demás sesiones» expulsa a la otra.
- [ ] Desde la raíz: `bun run lint` (Biome) y `cd backend && bun run tsc` +
      `cd frontend && bun run build` pasan sin errores.

## 5b. Despliegue con Docker (Dokploy)

- [ ] **Cada servicio se construye con su carpeta como contexto**
      (`backend/`, `frontend/`), cada una con su `.dockerignore`.
- [ ] **Los lockfiles de las imágenes se regeneran al cambiar dependencias**:
      `bun run lockfile` en la raíz, que actualiza `backend/bun.lock` y
      `frontend/bun.lock`. Existen además del de la raíz porque desde el
      contexto de cada carpeta aquel no se alcanza, y sin lockfile
      `bun install --frozen-lockfile` **no falla**: instala resolviendo de cero
      y la imagen acaba con versiones que nadie probó. Si se olvida, el build
      de Docker falla con *"lockfile had changes, but lockfile is frozen"* — no
      se rompe en silencio.
- [ ] La versión no necesita configuración: `build.ts` la compone con el número
      de `package.json` más un sello `<equipo>.<marca>` que cambia en cada
      build (dentro de Docker el equipo es el id del contenedor que construye).
      Sale en `GET /api/` y en cada evento de Sentry — es lo que identifica de
      qué despliegue salió un fallo. Subir el número semántico sigue siendo
      manual, en `backend/package.json`.
- [ ] `SENTRY_DSN` entre las variables de entorno del servicio (no como build
      arg: se lee al arrancar). Comprobar en los logs del contenedor la línea
      `[SENTRY] Reporte de errores ACTIVO`; si dice `DESACTIVADO`, no reporta.
- [ ] `NODE_ENV=production` ya lo fija el `Dockerfile` del **backend**, así que
      el entorno que se ve en Sentry sale bien sin tocar nada. El frontend no
      tiene runtime de Node: se compila y lo sirve `nginx:alpine-slim` con
      `frontend/nginx.conf`, y su entorno sale del `BUILD_MODE` del build
      (`prod` → `.env.production`, `qas` → `.env.qas`).

## 6. Primer módulo de negocio

Seguir `docs/practicas.md` (checklist §6) y usar `docs/prompt-nuevo-modulo.md`
para generar el esquema de BD.
