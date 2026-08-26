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
- Toda tabla **de entidad** termina con: `status BOOLEAN DEFAULT TRUE`
  (soft-delete), `user_cr`, `token_cr`, `date_cr` (epoch BIGINT), `user_up`,
  `token_up`, `date_up` — en ese orden. `token_cr`/`token_up` son `UUID` y
  guardan la **sesión** (`core.user_sessions.id`, el `sid` del token) desde la
  que se creó o modificó la fila: quién + desde qué dispositivo + cuándo.
  Las **tablas de evento** (`notifications`, `password_recovery`,
  `user_sessions`) no lo llevan: nadie las edita desde una pantalla, así que
  esas columnas serían siempre redundantes. Detalle en `postgres/README.md`.
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
        data.token_cr = (user as any).sid;    // SIEMPRE: desde qué sesión
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
  `core/auth.guard.ts`). Acepta un slug o **array** (basta con tener uno: útil
  para catálogos que consultan varias pantallas, como `GET /roles`). El rol
  `Administrador` (o id 1) pasa todo.
  `authPlugin` es **fail-closed**: cualquier ruta de una instancia que lo use
  exige token válido aunque olvides la macro (`onBeforeHandle` con scope
  `scoped`, que no alcanza a las rutas públicas montadas fuera del grupo).
  Aun así, **declara siempre el nivel de acceso**: `requirePermission: null`
  para "basta con estar autenticado" (perfil, notificaciones, sesiones,
  `/users/combo`) y el slug o array cuando haga falta un permiso.
- **Nunca validar el token a mano** en un módulo (`validateToken(headers)` en el
  handler): salta el guard y la ruta queda sin control de permisos. Usar siempre
  `.use(authPlugin)` + `requirePermission`, y leer la identidad de `user`.
- **Errores**: los `RAISE EXCEPTION` de BD llegan en `r.error`; responder
  `400 { message }`. El handler global de `index.ts` cubre 404/500/validación.
- **Convención REST**: `GET /x` lista, `GET /x/:id` detalle, `POST /x` crea,
  `PUT /x` actualiza (id en el body), `DELETE /x/:id` soft-delete.
  UPSERT: el mismo `save_*` maneja insert/update según `id`.
- **Auditoría**: en operaciones críticas llamar `logAudit(...)` de
  `core/audit.helper.ts` (fire-and-forget, no bloquea la respuesta), pasando
  `sessionId: (user as any).sid` para que la bitácora guarde la sesión de origen.
- **Archivos**: subir a S3 con `core/s3.ts` (`buildKeyObject` + `uploadToS3Private`),
  guardar solo la key en BD y devolver URLs firmadas (`getS3ObjectUrl`).
  Imágenes: convertir a WebP con `core/image.ts` cuando aplique.
- **Registro**: importar y `.use()` el API en `src/router.ts`.
- Alias de imports: `@core/*`, `@modules/*`, `@/*` (definidos en `tsconfig.json`).
- Config SOLO vía `src/config.ts` (nunca `process.env` suelto en módulos).

### Sesiones y refresh token

El login entrega **dos** credenciales y abre una fila en `core.user_sessions`:

| Credencial | Vida | Dónde vive | Para qué |
|---|---|---|---|
| `token` (access, JWT) | `JWT_ACCESS_EXPIRE_IN` (15 min) | `localStorage` + cookie `session_token` | Cabecera `Authorization` de cada request |
| `refreshToken` (opaco `<sid>.<secreto>`) | `JWT_REFRESH_EXPIRE_IN` (7 días) | `localStorage` + cookie `refresh_token` | Canjearlo en `POST /auth/refresh` |

```
POST /auth/login    → { user, token, refreshToken, expiresIn, refreshExpiresIn }
POST /auth/refresh  → rota el refresh y emite un token nuevo (no exige access válido)
POST /auth/logout   → revoca la sesión actual
POST /auth/verify-token → revalida y devuelve el usuario fresco (NO emite tokens)
GET/DELETE /auth/sessions[/:id] → listar y cerrar sesiones del propio usuario
```

- El JWT lleva `sid` = `core.user_sessions.id`. `core/auth.guard.ts` lo expone en
  `user.sid`: es el `token_cr`/`token_up` que debe viajar a toda función `save_*`.
- `core/session.ts` orquesta BD + Redis. **Redis es solo caché**: si no tiene la
  sesión se consulta `core.get_user_session`, así una revocación aplica al
  instante y una caída de Redis no cierra sesiones.
- El refresh es **rotativo**: cada canje invalida el anterior. Presentar uno ya
  rotado revoca la sesión completa (robo de token).
- El frontend no llama a `/auth/refresh` a mano: `core/http.ts` renueva y
  reintenta ante un 401, con *single-flight* para que N peticiones en paralelo
  compartan una sola renovación, y `auth-provider.tsx` renueva de forma proactiva
  un minuto antes del vencimiento.
- Cambiar la contraseña cierra el resto de dispositivos (`PASSWORD_CHANGE`);
  restablecerla por correo los cierra **todos**. Desactivar o eliminar un usuario
  revoca sus sesiones, no solo su socket.

### Permisos (RBAC)

- Slugs `modulo.accion` (`clientes.view`, `clientes.manage`) o
  `modulo.submodulo.accion` para módulos grandes.
- Verbos estándar: `view`, `view_all`, `create`, `edit`, `delete`, `manage`,
  `export`, `approve`. Preferir `view` + `manage` para catálogos simples.
- **Triple sincronización obligatoria** al agregar permisos:
  1. `backend/src/core/permissions.constants.ts`
  2. `frontend/src/core/permissions.constants.ts` (gemelo exacto)
  3. `postgres/core/seed-permissions.sql` (fuente de verdad en BD)

#### Caché de permisos

Los permisos efectivos se cachean en Redis por usuario (`user:<id>:permissions`).
El contrato es el mismo que el de las sesiones: **Redis es caché,
`core.get_user_permissions` es la fuente de verdad**. Todo pasa por
`core/permissions.ts`:

- `userHasAnyPermission()` — lo que usa el guard. Si la clave no está (Redis
  reiniciado, TTL vencido o invalidación reciente) recarga desde BD **en la misma
  petición**. Nunca devuelve 403 por caché fría, y con Redis caído el sistema
  degrada a consultar BD en vez de bloquear a todo el mundo.
- `primeUserPermissions()` — carga desde BD y ceba la caché.
- `invalidateUsersPermissions()` — borra las claves. La recarga es perezosa, así
  que invalidar de más solo cuesta una consulta.

La caché se ceba en el login, en cada `/auth/refresh` y en `verify-token`, y
lleva TTL (`JWT_REFRESH_EXPIRE_IN`) para que no sobreviva a usuarios que ya no
vuelven. Un set vacío es un caso legítimo (usuario sin permisos), así que se
marca con un miembro centinela para distinguirlo de "caché fría".

**Al cambiar quién puede qué hay que invalidar.** Ya está resuelto para el
núcleo: editar un rol (`roles.api.ts` → `propagarCambioDeRol`) invalida a todos
sus miembros vía `core.list_users_by_role` y les manda `notifyUserReload`;
cambiar los roles de un usuario hace lo propio en `users.api.ts`. Si un módulo
de negocio altera permisos por su cuenta, debe invalidar igual.

### CAPTCHA (Cap)

Los endpoints públicos de `auth` (`login`, `forgot-password`,
`validate-recovery-code`, `reset-password`) exigen un token de
[Cap](https://trycap.dev), el CAPTCHA autoalojado de prueba-de-trabajo.

- **Backend**: `core/captcha.guard.ts` expone la macro `requireCaptcha: true`.
  Se aplica igual que `requirePermission`, y el esquema del body debe incluir
  `...captchaBodyField` (campo `cap-token`). El guard canjea el token contra
  `<instancia>/<siteKey>/siteverify` ANTES del handler y **falla cerrado**: si
  la instancia Cap no responde, la petición se rechaza con 503.
  Respuestas: `400` token ausente · `403` inválido/expirado/reusado · `503`
  instancia inalcanzable.
- **Frontend**: `<CapCaptcha>` (`components/CapCaptcha.tsx`) usa el **modo
  flotante**: el widget vive oculto en `document.body` y solo aparece anclado al
  botón de envío (`anchorRef`) mientras resuelve el reto.
  El disparo es **posterior a la validación**: se llama a `captchaRef.current.solve()`
  dentro del `onFinish` de Ant Design —que solo corre si el formulario validó—,
  así no se gasta una prueba-de-trabajo en un formulario con errores.
  `solve()` devuelve el token (o `''` si el CAPTCHA está desactivado) y lanza si
  el reto falla; `withCaptcha(params, capToken)` de `core/captcha.ts` lo adjunta
  al payload. Cada envío resuelve un reto nuevo, porque el token es de un solo uso.

  ```tsx
  const captchaRef = useRef<CapCaptchaHandle>(null)
  const submitRef = useRef<any>(null)

  const onFinish = async (values) => {          // AntD ya validó
      setLoading(true)
      let capToken: string
      try { capToken = await captchaRef.current.solve() }
      catch { message.error(CAPTCHA_FAILED_MSG); setLoading(false); return }
      await miServicio.enviar(values, capToken)  // -> withCaptcha(...)
  }

  <CapCaptcha ref={captchaRef} anchorRef={submitRef} />
  <Button ref={submitRef} htmlType="submit" loading={loading}>Enviar</Button>
  ```

  NOTA: no se usa el helper oficial `cap-floating.js`; ese intercepta el click
  en fase de captura (`stopImmediatePropagation`) y resolvería el reto ANTES de
  que Ant Design valide, que es justo lo contrario de lo que queremos.
- **Configuración**: `CAP_API_ENDPOINT` + `CAP_SECRET_KEY` (backend) y
  `VITE_CAP_API_ENDPOINT` (frontend, endpoint público con barra final). La
  clave secreta NUNCA viaja al navegador. Si las variables quedan vacías el
  CAPTCHA se desactiva por completo y el backend avisa al arrancar — es el
  estado por defecto de la plantilla, pero **en producción deben definirse**.

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
  El backend mantiene el mapa de sockets `wsSessions` (indexado por `wsid`, cada
  entrada recuerda el `sid` de la sesión) y expone helpers:
  `notifyUserClose(userId)` (cierra todos los sockets del usuario),
  `notifySessionClose(sessionId)` (cierra solo un dispositivo),
  `notifyUserReload(userId)` (recargar sesión/permisos) y
  `notifyUserJson(userId, data)` (mensaje arbitrario).
  Cerrar el socket NO invalida el token: para eso hay que revocar la sesión con
  los helpers de `core/session.ts`.
- Para eventos de módulo: emitir desde el backend con `notifyUserJson` y manejar
  el `type` del mensaje en el handler WS de `frontend/src/App.tsx`.

### Notificaciones (campana)

Circuito completo, de la emisión a la campana:

```
createNotification()                    ← backend/src/modules/core/notifications.helper.ts
  ├─ core.create_notification(req)     → persiste en core.notifications
  └─ notifyUserJson(userId, { type: 'notification', payload })   → push WS si está conectado
                                          ↓
frontend App.tsx (handler WS type === 'notification')
  ├─ useNotificationsStore.addNotification(payload)   → campana (badge + lista)
  └─ toast AntD con botón "Ver" si payload.link       → navega y marca leída
```

- **Emitir** (desde cualquier módulo del backend):

  ```ts
  import { createNotification } from '@modules/core/notifications.helper';

  await createNotification({
      userId: 42,
      title: 'Pedido aprobado',
      message: 'El pedido #123 fue aprobado por gerencia.',
      type: 'success',          // info | success | warning | error (estilo del toast)
      module: 'ventas',
      link: '/pedidos',         // ruta interna: botón "Ver" en el toast y la campana
  });
  ```

  Si el usuario no está conectado, no se pierde: queda en BD y la verá al abrir
  la campana. Para notificar a varios usuarios, obtener los destinatarios con
  `core.list_users_by_permission` y llamar `createNotification` por cada uno.

- **Consumir** (ya resuelto por el núcleo, no requiere código nuevo):
  `NotificationsPopover` (campana en el header) usa `store/notifications.store.ts`,
  que llama a los endpoints de `modules/core/notifications.api.ts`:
  `GET /notifications` (lista + `unreadCount`), `PUT /notifications/:id/read`,
  `PUT /notifications/read-all`. Operan siempre sobre el usuario del token
  (`requirePermission: null` = solo autenticación; la función SQL de marcado
  filtra por `user_id` para no tocar notificaciones ajenas).

- **BD**: tabla `core.notifications` + funciones en
  `postgres/core/notifications/procedures.sql` (`create_notification`,
  `list_notifications`, `count_unread_notifications`, `mark_notification_as_read`,
  `mark_all_notifications_as_read`).

- **Probar**: con el backend corriendo y sesión abierta en el frontend, ejecutar
  `bun run src/utils/trigger-test-notification.ts <userId>` (solo persiste en BD;
  el push en vivo ocurre cuando `createNotification` se llama desde el servidor).

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
5. **Endpoints públicos** (sin token de sesión): protegerlos con
   `requireCaptcha: true` + `...captchaBodyField` y montar `<CapCaptcha>` en el
   formulario correspondiente.

## 7. Calidad y estilo

- TypeScript estricto; ejecutar `bun run tsc` (backend) y `bun run build`
  (frontend) antes de dar por cerrado un cambio.
- Sin dependencias nuevas salvo necesidad real; el stack ya cubre tablas,
  gráficas (`@ant-design/plots`, chart.js) y export (exceljs, jspdf).
- Commits pequeños y descriptivos, siguiendo [Conventional Commits](https://www.conventionalcommits.org):
  `<tipo>[(alcance)][!]: <descripción>`. Tipos: `feat`, `fix`, `docs`, `refactor`,
  `perf`, `test`, `build`, `ci`, `chore`, `style`, `revert`. Alcance = área tocada
  (`backend`, `frontend`, `postgres`, `docs`) o el módulo (`auth`, `equipo`, …).
  Descripción en **español**, minúscula, imperativo y sin punto final; `!` o footer
  `BREAKING CHANGE:` para cambios incompatibles.
  Ej.: `feat(equipo): permitir filtrar usuarios por rol`.
- Secretos SOLO en `.env` (gitignorado); `example.env` documenta las claves sin valores.
