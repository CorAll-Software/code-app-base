import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { Elysia, } from "elysia";
import { configServer } from './config';
import { routerApi, routerWs } from './router';
import { mainServer } from './run-server';

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
  .onError(({ code, error, set, request }) => {
    // console.log({ code, error, request: { method: request.method, url: request.url } });
    switch (code) {
      case 'NOT_FOUND':
        const url = new URL(request.url);
        return { message: `Not found: ${request.method} ${url.pathname}` }
      case 'INTERNAL_SERVER_ERROR':
        return { message: 'Internal server error' }
      case 'VALIDATION':
        const fields = error.all.map(e => e.path.replace('/', '')).join(', ')
        return {
          message: `Error de validación en: ${fields}`,
          errors: error.all.map(e => ({ field: e.path.replace('/', ''), message: e.message }))
        }
      default:
        return { message: 'Unknown error' }
    }
  })
  .use(openapi()) // http://localhost:3000/openapi

  .group('/api', (api) => api.use(routerApi))
  .group('/ws', (ws) => ws.use(routerWs))


app.listen(configServer.port);

console.log(`🦊 Elysia is running at ${app.server?.url?.origin}`);