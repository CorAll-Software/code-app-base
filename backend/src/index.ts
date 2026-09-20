import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { Elysia, } from "elysia";
import { configServer } from './config';
import { routerApi, routerWs } from './router';
import { mainServer } from './run-server';
import { initSentry, registrarErroresNoAtrapados, reportarError } from '@core/sentry';

// Antes que nada: si el reporte no queda activo, que se vea en el arranque.
initSentry()
registrarErroresNoAtrapados()

try {
  mainServer()
} catch (error) {
  console.error(error)
}

const app = new Elysia()
  // .mapResponse(compressResponse)
  .use(cors({
    origin: true,
    credentials: true,
  }))
  /*
    Manejador global de errores.

    Va declarado ANTES de los `.group(...)` a propósito: en Elysia los hooks se
    encadenan, y uno declarado después de registrar las rutas no las alcanza.

    Ojo con `code`: una excepción corriente (`throw new Error(...)`) llega como
    'UNKNOWN', no como 'INTERNAL_SERVER_ERROR'. Colgar el reporte de ese último
    caso sería no reportar nunca nada.

    Qué entra en la bitácora y qué no:
      · NOT_FOUND, VALIDATION, PARSE y cualquier 4xx → NO. Son el cliente
        pidiendo mal, no un defecto del servidor.
      · Todo lo demás → SÍ. Es una excepción que nadie previó.
  */
  .onError(({ code, error, set, request, path }) => {
    const url = new URL(request.url);

    switch (code) {
      case 'NOT_FOUND':
        return { message: `Not found: ${request.method} ${url.pathname}` }

      case 'VALIDATION': {
        const fields = error.all.map(e => e.path.replace('/', '')).join(', ')
        return {
          message: `Error de validación en: ${fields}`,
          errors: error.all.map(e => ({ field: e.path.replace('/', ''), message: e.message }))
        }
      }

      case 'PARSE':
        set.status = 400;
        return { message: 'Cuerpo de la petición mal formado' }

      default: {
        // Un `status(4xx)` lanzado en vez de devuelto también cae aquí; no es
        // una incidencia, así que se respeta su código y no se reporta.
        const statusLanzado = (error as any)?.status;
        if (typeof statusLanzado === 'number' && statusLanzado < 500) {
          set.status = statusLanzado;
          return { message: (error as any)?.message ?? 'Solicitud inválida' }
        }

        const eventId = reportarError(error, {
          transaccion: `${request.method} ${path}`,
          etiquetas: { elysia_code: String(code), capa: 'http' },
          peticion: { url: url.pathname + url.search, metodo: request.method },
        });

        // Que quede traza local aunque el reporte esté apagado: hasta ahora un
        // 500 en producción no dejaba ninguna.
        console.error(`[500] ${request.method} ${url.pathname}${eventId ? ` · sentry=${eventId}` : ''}`, error);

        set.status = 500;
        return { message: 'Internal server error' }
      }
    }
  })
  .use(openapi()) // http://localhost:3000/openapi

  .group('/api', (api) => api.use(routerApi))
  .group('/ws', (ws) => ws.use(routerWs))


app.listen(configServer.port);

console.log(`🦊 Elysia is running at ${app.server?.url?.origin}`);