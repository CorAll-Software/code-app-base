import { execProcedure } from '@core/db/connection';
import { Elysia, t } from 'elysia';
import { authPlugin } from '@core/auth.guard';
import { PERMISSIONS } from '@core/permissions.constants';

/*
    Consulta de la bitácora.

    API de SOLO LECTURA, y no por criterio: `auditoria.log` no admite UPDATE ni
    DELETE ni siquiera desde la base (trigger de inmutabilidad), así que aquí no
    hay nada que escribir. La ausencia de POST/PUT/DELETE es la garantía, no un
    descuido — si alguna vez alguien echa uno en falta, la respuesta es que la
    bitácora no se corrige: se le añaden filas.

    Todo el módulo exige `auditoria.view`, que en la práctica solo tiene el rol
    Administrador. Un log consultable por cualquiera reúne en una sola pantalla
    quién hace qué y desde dónde: es información más sensible que las tablas que
    audita.
*/

const path = '/auditoria';

export const AuditoriaApi = new Elysia()
    .use(authPlugin)

    /** Línea de tiempo filtrable y paginada. */
    .get(`${path}/log`, async ({ query, status }) => {
        const result = await execProcedure('auditoria.get_log', [{
            esquema: query.esquema || null,
            entidad: query.entidad || null,
            id_registro: query.id_registro || null,
            usuario_id: query.usuario_id || null,
            id_caso: query.id_caso || null,
            operacion: query.operacion || null,
            desde: query.desde || null,
            hasta: query.hasta || null,
            buscar: query.buscar || null,
            pagina: query.pagina || 1,
            limite: query.limite || 50,
        }]);

        if (result.error) return status(400, { message: result.error });
        return result.result;
    }, {
        requirePermission: PERMISSIONS.AUDITORIA.VIEW,
        query: t.Object({
            esquema: t.Optional(t.String()),
            entidad: t.Optional(t.String()),
            id_registro: t.Optional(t.String()),
            usuario_id: t.Optional(t.Numeric()),
            id_caso: t.Optional(t.String()),
            operacion: t.Optional(t.String()),
            desde: t.Optional(t.Numeric()),
            hasta: t.Optional(t.Numeric()),
            buscar: t.Optional(t.String()),
            pagina: t.Optional(t.Numeric()),
            limite: t.Optional(t.Numeric()),
        }),
    })

    /** Valores presentes en la bitácora, para poblar los filtros de la pantalla. */
    .get(`${path}/filtros`, async ({ status }) => {
        const result = await execProcedure('auditoria.get_filtros', []);
        if (result.error) return status(400, { message: result.error });
        return result.result;
    }, {
        requirePermission: PERMISSIONS.AUDITORIA.VIEW,
    })

    /** Todo lo que le pasó a un registro concreto, del más reciente al más antiguo. */
    .get(`${path}/registro/:esquema/:entidad/:id`, async ({ params, query, status }) => {
        const result = await execProcedure('auditoria.get_registro', [{
            esquema: params.esquema,
            entidad: params.entidad,
            id_registro: params.id,
            limite: query.limite || 200,
        }]);

        if (result.error) return status(400, { message: result.error });
        // La función devuelve `{ error }` dentro del JSON cuando faltan datos,
        // igual que el resto del núcleo: no es un fallo de infraestructura.
        if (result.result?.error) return status(400, { message: result.result.error });
        return result.result;
    }, {
        requirePermission: PERMISSIONS.AUDITORIA.VIEW,
        query: t.Object({ limite: t.Optional(t.Numeric()) }),
    })

    /** Qué tablas tienen trigger y cuáles no: delata una tabla nueva sin auditar. */
    .get(`${path}/cobertura`, async ({ status }) => {
        const result = await execProcedure('auditoria.get_cobertura', [{}]);
        if (result.error) return status(400, { message: result.error });
        return result.result;
    }, {
        requirePermission: PERMISSIONS.AUDITORIA.VIEW,
    });
