# `auditoria/` — Bitácora inmutable de acciones

Una fila por **cada acción**: quién la hizo, cuándo, desde dónde y qué cambió.
No es un log de aplicación, es evidencia.

> Las columnas `user_cr` / `date_cr` / `user_up` / `date_up` que lleva cada tabla
> de entidad guardan el **estado actual** del registro: cada UPDATE pisa al
> anterior, así que diez modificaciones dejan una sola huella. Esta bitácora es
> lo contrario — diez modificaciones son diez filas con su diff.

## Archivos (en orden de dependencias)

| Archivo | Qué instala |
|---|---|
| `auditoria-tables.sql` | Esquema, `enum_operacion`, tabla `log`, índices y los **triggers de inmutabilidad**. |
| `contexto.sql` | `contexto()` (quién actúa) + `es_sensible()` / `enmascarar()`. |
| `trigger.sql` | `auditar()`: **un solo** trigger genérico para todas las tablas. |
| `instalacion.sql` | `activar_tabla` / `activar_esquema` / `desactivar_tabla` y las listas de exclusión. |
| `eventos.sql` | `registrar_evento()`: lecturas, descargas y lo que ningún trigger ve. |
| `consultas.sql` | `get_log`, `get_registro`, `get_filtros`, `get_cobertura`. |
| `install.sql` | Migración **reejecutable**: aplica todo lo anterior, activa los triggers y reporta lo que falta. |
| `prueba.sql` | Prueba de aceptación: alta, modificación parcial, baja, descarga e intento de edición de la bitácora. |

```bash
psql -d app_base -f postgres/auditoria/install.sql
```

## Cómo se llena

**Escrituras** (INSERT/UPDATE/DELETE) → **solas**, por el trigger genérico. No
dependen de que un endpoint se acuerde de registrar nada, no se pueden evitar
desde el backend y tampoco desde un script suelto contra la base.

**Lecturas y descargas** → explícitamente, con `auditoria.registrar_evento()`.
PostgreSQL no dispara triggers en SELECT: leer una fila no es interceptable.

## Declarar quién actúa

El trigger solo ve la fila; `current_user` es siempre el usuario del pool. Quién
actúa lo sabe la función de negocio, así que lo declara al entrar:

```sql
CREATE OR REPLACE FUNCTION ventas.save_cliente(req json) RETURNS json AS $$
BEGIN
    PERFORM auditoria.contexto(req);   -- SIEMPRE la primera línea
    ...
```

`contexto(req)` reconoce los nombres con los que este sistema llama al autor
(`user_cr`, `user_up`, `user_id`, …) y a la sesión (`token_cr`, `sid`, …), más
`ip` / `user_agent` / `endpoint` si la ruta los manda. En el backend eso es una
línea:

```ts
const data = { ...body, ...contextoAuditoria(user, headers, `PUT ${path}`) }
```

Detalles que importan:

- `set_config(..., TRUE)` es **SET LOCAL**: vive lo que dura la transacción.
  Como cada `execProcedure` es una sola sentencia (su propia transacción
  implícita) sobre una conexión cualquiera del pool, el contexto **no se filtra**
  a la siguiente petición que reutilice esa conexión. Sin ese `TRUE`, el usuario
  A acabaría firmando las acciones del usuario B.
- **No abrir BEGIN/COMMIT desde el backend solo para esto**: costaría dos viajes
  extra por operación y no aporta nada. Tampoco sirve llamar a `contexto()` en
  un `execProcedure` aparte: moriría con su propia transacción.
- **Un nulo no pisa lo declarado**: un helper interno hereda el contexto de quien
  lo llamó en vez de vaciarlo.
- **Si una función no declara contexto la auditoría no se queda muda**: el
  trigger cae en `user_cr` / `user_up` de la propia fila. El contexto solo añade
  precisión (cascadas, tablas sin esas columnas, sesión e ip).

## Exclusiones deliberadas

### Columnas que no cuentan como cambio

`auditoria.ignoradas_por_defecto()` — un UPDATE que solo las toca **no deja
fila**. Siguen guardándose enteras en los snapshots de alta y baja.

| Columna | Por qué |
|---|---|
| `user_cr`, `token_cr`, `date_cr`, `user_up`, `token_up`, `date_up` | Son **consecuencia** del cambio, no el cambio. Si contaran, todo UPDATE tendría diff (siempre se mueve `date_up`) y la regla de "un UPDATE que no cambia nada no se registra" no filtraría nada. |
| `last_login` | Marca de uso, no un cambio de datos: se mueve en cada inicio de sesión. Sin ignorarla, cada login dejaría dos filas —el evento `LOGIN` y un `UPDATE` indistinguible— y la bitácora sería mayormente ruido. |

### Tablas

Fuera del barrido automático, cada una por su motivo:

| Excluida | Por qué |
|---|---|
| `auditoria.log` | El historial del historial. `activar_tabla` rechaza el esquema entero, no se puede activar ni a mano. |
| `core.user_sessions` | **Ruido de máquina**: la rotación del refresh token hace un UPDATE cada pocos minutos por usuario activo y sepultaría las acciones de personas. |
| `core.notifications` | Ruido de máquina: las escribe el sistema y se marcan leídas en lote. |
| `core.password_recovery` | Historial append-only de códigos de un solo uso, y `recovery_code` es el código en claro. El hecho auditable (cambió la contraseña) queda en `core.users`. |

Lo que en `core.user_sessions` **sí** es una acción se registra explícitamente:

| Evento | Operación | Dónde |
|---|---|---|
| Inicio de sesión | `LOGIN` | `core.create_user_session` |
| Credenciales inválidas / cuenta inactiva | `LOGIN_FALLIDO` | `auth.api.ts` (la contraseña se verifica en el backend, no en la base) |
| Cierre y revocación de sesión | `BAJA` | `core.revoke_user_session` / `core.revoke_user_sessions` |
| Refresh token ya rotado (posible robo) | `ACCESO_DENEGADO` | `core.rotate_user_session` |
| 403 por falta de permiso | `ACCESO_DENEGADO` | `core/auth.guard.ts` |

## Lecturas: qué se audita y qué no

Solo los accesos a **información**, nunca cada listado paginado. Auditar
`GET /users` —que se pide en cada carga de pantalla— produciría más filas que
todas las escrituras juntas.

En la plantilla **no hay ninguna lectura instrumentada todavía**, a propósito:

- Los listados (`GET /users`, `/users/combo`, `/roles`, `/permissions`) son
  catálogos de UI, no accesos a un expediente.
- La única "descarga" existente es la **foto de perfil**, cuya URL se firma en
  cada listado de usuarios y en cada login: auditarla sería el mismo ruido de
  máquina que la rotación de sesiones.

Cuando un proyecto agregue lecturas sensibles (ficha de un tercero, detalle de
un expediente) o descargas reales, se instrumentan así:

```sql
-- Desde la función SQL que sirve la lectura
PERFORM auditoria.registrar_evento('expedientes', 'LECTURA', _id::TEXT);
```

```ts
// Desde un endpoint de descarga: registrar ANTES de entregar la URL
if (!await registrarDescarga({ entidad: 'archivo', usuarioId: user.id, idRegistro: id, headers })) {
    return status(500, { message: 'No se pudo registrar la descarga' })
}
return { url: await getS3ObjectUrl(key) }
```

### Funciones sin contexto (a propósito)

`install.sql` lista al final las funciones que escriben y no declaran su autor.
Dos quedan fuera de ese informe deliberadamente, porque **solo escriben en tablas
excluidas** y declarar el contexto no cambiaría nada — no hay trigger que lo lea:

- `core.create_notification`, `mark_notification_as_read`, `mark_all_notifications_as_read`
- `core.request_password_recovery`, `core.validate_recovery_code`, `core.purge_user_sessions`

`core/seed-permissions.sql` tampoco aparece: es un script de seed, no una
función. Sus INSERT sí quedan auditados, con `usuario_id` nulo — que es la
lectura correcta: los escribió la instalación, no una persona.

## Cobertura

Una tabla **sin trigger** no aparece nunca en la bitácora, y esa ausencia se lee
igual que "no pasó nada". Por eso hay una consulta que lo delata, expuesta en la
pantalla con el botón *Cobertura*:

```sql
SELECT jsonb_pretty(auditoria.get_cobertura()::jsonb);
```

**Al agregar un esquema de negocio**, actívalo con una línea:

```sql
SELECT auditoria.activar_esquema('ventas');
```

## Salida de emergencia

El trigger **falla cerrado**: si la auditoría no puede escribir, la operación
auditada falla con ella. Un cambio que no se puede auditar no debe confirmarse.
Si eso llegara a bloquear algo crítico en producción:

```sql
SELECT auditoria.desactivar_tabla('ventas', 'pedidos');
```

La tabla pasará a `auditada = false` en la cobertura, que es justo el aviso que
tiene que quedar.

## `id_caso`: punto de extensión

`auditoria.log.id_caso` responde a "todo lo que pasó en el expediente X"
atravesando todas sus tablas. En esta **plantilla** no hay ningún agregado de
negocio, así que hoy es siempre `NULL` (su índice es parcial por eso mismo).

Cada proyecto lo rellena de una de estas dos formas:

1. Añadiendo una columna `id_caso` a sus tablas — el trigger la toma sola.
2. Declarándolo en el contexto: `PERFORM auditoria.contexto(req)` con `id_caso`
   dentro del `req`, para las tablas que no la llevan.

## Lo que este diseño NO garantiza

- **No protege del superusuario de PostgreSQL**: quien pueda hacer
  `DROP TRIGGER` puede desactivar la inmutabilidad. Lo que se garantiza es que
  nadie borre evidencia por la vía normal ni por descuido; el resto es cuestión
  de a quién se le da esa cuenta.
- **Los secretos se enmascaran por patrón de nombre**
  (`password|contrase|token|secret|hash|salt|api_key|recovery|codigo`). Una
  columna sensible con un nombre que no encaje en el patrón entraría en claro:
  al crear una tabla con secretos, comprobarlo con `auditoria.es_sensible()`.
  Excepción documentada: `token_cr`/`token_up` **no** se enmascaran — son ids de
  sesión, no credenciales, y son la traza del dispositivo.
