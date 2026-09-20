# Frontend · SPA React (Vite)

SPA con React 19 + TypeScript + Ant Design 6 + Zustand. Incluye login, recuperación
de contraseña, perfil, gestión de usuarios, roles/permisos y auditoría.

## Arranque

```bash
bun install
bun run dev      # http://localhost:5004 (requiere el backend en :3000)
```

## Scripts

| Script | Descripción |
|--------|-------------|
| `bun run dev` | Vite dev server con HMR |
| `bun run build` | `tsc` + build de producción |
| `bun run build:qas` | Build con `.env.qas` |
| `bun run build:prod` | Build con `.env.production` |
| `bun run preview` | Sirve el build de `dist/` para revisarlo |

> El lint no vive aquí: es Biome y se corre desde la raíz del monorepo
> (`bun run lint` / `bun run lint:fix`), con un solo `biome.json` para los dos
> workspaces.

## Estructura

```
src/
├── main.tsx / App.tsx      # Bootstrap, layout general (header, sider, contenido)
├── router.config.tsx       # Rutas privadas (data router + lazy + PermissionRoute)
├── public-router.config.tsx# Rutas públicas (login, recuperar contraseña)
├── menu.config.tsx         # Sidebar (visibilidad por slug de permiso)
├── core/                   # http (GET/POST tipados + refresh transparente), ws,
│                           # permisos, colores, hooks, parse, tipos y utilidades
├── layouts/                # login, home, perfil, 404, permission-route, etc.
├── providers/              # AuthProvider (sesión, renovación proactiva del token),
│                           # message provider
├── components/             # Reutilizables: DataTable, StandardPageLayout,
│                           # StandardModalForm, StandardFilters, avatares,
│                           # profile-drawer (Perfil / Contraseña / Sesiones)
├── store/                  # Zustand: notificaciones, drawer de perfil
├── services/               # Servicios transversales (auth, sesiones, foto de perfil)
└── modules/
    ├── equipo/             # Gestión de usuarios
    ├── configuracion/      # Roles y permisos
    └── auditoria/          # Visor de la bitácora
```

## Cómo agregar un módulo

Ver `../docs/practicas.md`. Resumen: crear `modules/<modulo>/{pages,components,services}`,
declarar slugs en `core/permissions.constants.ts` (sincronizado con backend y seed SQL),
registrar la ruta en `router.config.tsx` y la entrada de menú en `menu.config.tsx`.
