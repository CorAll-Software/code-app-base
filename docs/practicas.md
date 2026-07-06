# Prácticas del stack CorAll

Convenciones de punta a punta para construir módulos sobre esta plantilla.
Regla general: **no inventes patrones nuevos; imita los que ya están en `core`.**

---

## 1. Arquitectura en tres capas

Cada módulo de negocio atraviesa las tres capas con el mismo nombre de esquema:

```
postgres/<modulo>/          → DDL + funciones SQL (la lógica de datos vive en BD)
backend/src/modules/<modulo>/<modulo>.api.ts   → endpoints Elysia (orquestación fina)
frontend/src/modules/<modulo>/{pages,components,services}
```

La **lógica de negocio pesada vive en PostgreSQL** (funciones `plpgsql` que reciben
`req json` y retornan `json`). El backend es una capa delgada: valida, autoriza,
llama `execProcedure()` y adapta la respuesta. El frontend consume servicios tipados.

## 2. Base de datos (PostgreSQL)

Detalle completo en [`../postgres/README.md`](../postgres/README.md). Lo esencial:

- Un **esquema por módulo** (`CREATE SCHEMA ventas;`), `core` es la base.
- Toda tabla termina con: `status BOOLEAN DEFAULT TRUE` (soft-delete), `user_cr`,
  `date_cr` (epoch BIGINT), `user_up`, `date_up` — en ese orden.
- Fechas en **epoch BIGINT**, montos `NUMERIC(12,2)`, ENUMs idempotentes prefijados
  por esquema (`ventas.enum_estado`).
- Funciones con firma única `f(req json) RETURNS json`:
  `get_<entidades>`, `save_<entidad>` (UPSERT con COALESCE), `delete_<entidad>`
  (soft), `get_<entidad>_by_id`. Validaciones con `RAISE EXCEPTION` en español
  (el mensaje llega tal cual al usuario).
- Auditoría transversal en `core.audit_log` vía `core.save_audit_log(req)`;
  no crear bitácoras por módulo.
- Cada esquema mantiene su `.sql` + `.dbml` y se propaga al agregado raíz
  `postgres/tables.sql` / `tables.dbml`.

## 3. Backend (Bun + Elysia)

### Estructura de un API de módulo

Un solo archivo `modules/<modulo>/<modulo>.api.ts` que exporta un `Elysia` plugin
(ver `modules/core/users.api.ts` como referencia canónica):

```ts
import { Elysia, t } from 'elysia';
import { execProcedure } from '@core/db/connection';
import { authPlugin } from '@core/auth.guard';
import { PERMISSIONS } from '@core/permissions.constants';

const path = '/clientes';

export const ClientesApi = new Elysia()
    .use(authPlugin)
    .get(path, async ({ set }) => {
        const r = await execProcedure('ventas.get_clientes', [{}]);
        if (r.error) { set.status = 400; return { message: r.error }; }
        return r.result;
    }, { requirePermission: PERMISSIONS.CLIENTES.VIEW })
    .post(path, async ({ body, set, user }) => {
        const data = body as any;
        data.user_cr = (user as any).id;      // SIEMPRE: quién crea/edita
        const r = await execProcedure('ventas.save_cliente', [data]);
        if (r.error) { set.status = 400; return { message: r.error }; }
        return r.result;
    }, {
        requirePermission: PERMISSIONS.CLIENTES.MANAGE,
        body: t.Object({ /* schema TypeBox — valida y documenta en OpenAPI */ })
    });
```

Reglas:

- **Autorización declarativa**: `requirePermission: <slug>` (macro de
  `core/auth.guard.ts`). Acepta un slug o array (basta uno). El rol
  `Administrador` (o id 1) pasa todo. Endpoint sin `requirePermission` = solo
  requiere token válido.
- **Errores**: los `RAISE EXCEPTION` de BD llegan en `r.error`; responder
  `400 { message }`. El handler global de `index.ts` cubre 404/500/validación.
- **Convención REST**: `GET /x` lista, `GET /x/:id` detalle, `POST /x` crea,
  `PUT /x` actualiza (id en el body), `DELETE /x/:id` soft-delete.
  UPSERT: el mismo `save_*` maneja insert/update según `id`.
- **Auditoría**: en operaciones críticas llamar `logAudit(...)` de
  `core/audit.helper.ts` (fire-and-forget, no bloquea la respuesta).
- **Archivos**: subir a S3 con `core/s3.ts` (`buildKeyObject` + `uploadToS3Private`),
  guardar solo la key en BD y devolver URLs firmadas (`getS3ObjectUrl`).
  Imágenes: convertir a WebP con `core/image.ts` cuando aplique.
- **Registro**: importar y `.use()` el API en `src/router.ts`.
- Alias de imports: `@core/*`, `@modules/*`, `@/*` (definidos en `tsconfig.json`).
- Config SOLO vía `src/config.ts` (nunca `process.env` suelto en módulos).

### Permisos (RBAC)

- Slugs `modulo.accion` (`clientes.view`, `clientes.manage`) o
  `modulo.submodulo.accion` para módulos grandes.
- Verbos estándar: `view`, `view_all`, `create`, `edit`, `delete`, `manage`,
  `export`, `approve`. Preferir `view` + `manage` para catálogos simples.
- **Triple sincronización obligatoria** al agregar permisos:
  1. `backend/src/core/permissions.constants.ts`
  2. `frontend/src/core/permissions.constants.ts` (gemelo exacto)
  3. `postgres/core/seed-permissions.sql` (fuente de verdad en BD)
- Los permisos efectivos se cachean en Redis por usuario; el guard consulta
  `userStore.hasPermission()`. Al editar roles, el backend notifica por WS y el
  frontend recarga la sesión.

## 4. Frontend (React + Ant Design)

### Estructura de un módulo

```
modules/<modulo>/
├── pages/<Entidad>.page.tsx      # export default (para lazy import)
├── components/<X>FormModal.tsx   # modales de alta/edición
└── services/<modulo>.service.ts  # tipos + llamadas HTTP
```

### Servicios

Usar los helpers tipados de `core/http.ts` — nunca `fetch` directo:

```ts
import { GET, POST, PUT, DELETE, Paginated } from '@src/core/http';

export interface Cliente { id: number; nombre: string; status: boolean; }

export const clientesService = {
    list: () => GET<Cliente[]>('clientes'),
    save: (data: Partial<Cliente>) =>
        (data.id ? PUT : POST)<Cliente>('clientes', { params: data, msgSuccess: 'Cliente guardado' }),
    remove: (id: number) => DELETE(`clientes/${id}`, { msgSuccess: 'Cliente eliminado' }),
};
```

- `GET/POST/PUT/DELETE` inyectan el token, manejan 401 (logout automático) y
  muestran mensajes de éxito/error (`msgSuccess`, `msgError`, `hideNotification`).
- Respuestas paginadas de servidor usan la forma `Paginated<T>`
  (`{ data, total, page, page_size }`).

### Rutas y menú

1. Slugs en `core/permissions.constants.ts` (gemelo del backend).
2. Ruta en `router.config.tsx` con lazy import:
   `{ path: "clientes", label: "Clientes", slug: PERMISSIONS.CLIENTES.VIEW, load: () => import("./modules/clientes/pages/Clientes.page") }`
   — el `PermissionRoute` bloquea el acceso sin permiso; una ruta sin `load`
   renderiza un placeholder "Sección en implementación".
3. Entrada en `menu.config.tsx` con el mismo `slug` (sin permiso → no se muestra).

### Páginas y componentes

- Componer con los estándar: `StandardPageLayout` (título + acciones + contenido),
  `DataTable` (tabla con búsqueda/orden/paginación), `StandardModalForm` y
  `StandardFilters`. Ver `modules/equipo/pages/UsersManagement.page.tsx` como
  referencia canónica de un CRUD completo.
- Estados/enum de BD → listas en `core/listas.tsx` con `generateListMap`
  (los `value` coinciden EXACTAMENTE con el ENUM de PostgreSQL, en mayúsculas).
- Colores solo desde `core/color.ts` (`BRAND`, `SEMANTIC_COLORS`); no hex sueltos.
- Estado global solo para lo transversal (Zustand en `store/`); el estado de un
  módulo vive en sus componentes/hooks.
- Fechas: la BD entrega epoch (segundos) → formatear con `dayjs` en el frontend.
- Textos de UI en español; código (variables/funciones) en inglés o español
  consistente con el archivo que tocas.

## 5. Tiempo real (WebSocket)

- Canal autenticado en `/ws` (`modules/core/auth.ws.ts` + `frontend/src/core/ws.ts`).
- Usos del núcleo: cierre remoto de sesión (usuario deshabilitado), recarga de
  permisos y notificaciones push (campana).
- Para eventos de módulo: emitir desde el backend con los helpers de `auth.ws.ts`
  y suscribirse en el frontend vía el store correspondiente.

## 6. Checklist al agregar un módulo

1. **BD**: `postgres/<modulo>/` (DDL + dbml + funciones) → propagar a
   `tables.sql`/`tables.dbml` → `ALTER TYPE core.enum_module ADD VALUE 'X'` →
   permisos en `seed-permissions.sql` → actualizar `postgres/README.md`.
2. **Backend**: `modules/<modulo>/<modulo>.api.ts` → slugs en
   `core/permissions.constants.ts` → registrar en `router.ts` → sincronizar
   `AuditModule` en `core/audit.helper.ts` → rutas S3 en `config.ts` si aplica.
3. **Frontend**: slugs gemelos → `services/` → `pages/` → ruta en
   `router.config.tsx` → menú en `menu.config.tsx` → sincronizar `AuditModule`
   en `modules/configuracion/services/audit.service.ts` → listas de enums en
   `core/listas.tsx`.
4. **Verificar**: `bun run tsc` en backend y `bun run build` en frontend;
   probar el flujo con un rol SIN el permiso nuevo (debe ocultarse/403).

## 7. Calidad y estilo

- TypeScript estricto; ejecutar `bun run tsc` (backend) y `bun run build`
  (frontend) antes de dar por cerrado un cambio.
- Sin dependencias nuevas salvo necesidad real; el stack ya cubre tablas,
  gráficas (`@ant-design/plots`, chart.js), export (exceljs, jspdf), mapas (leaflet).
- Commits pequeños y descriptivos en español.
- Secretos SOLO en `.env` (gitignorado); `example.env` documenta las claves sin valores.
