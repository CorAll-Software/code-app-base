import { defineConfig, loadEnv } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import react from '@vitejs/plugin-react-swc'
import analyze from 'rollup-plugin-analyzer'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'node:path'
import pkg from './package.json'

const nn = (n: number) => n < 10 ? `0${n}` : n
const build1 = Math.floor(Date.now() / 10000).toString(36).toUpperCase()
const hostname = process.env.USERNAME?.toUpperCase() || 'DEV'
const date = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${nn(d.getMonth() + 1)}-${nn(d.getDate())} ${nn(d.getHours())}:${nn(d.getMinutes())}:${nn(d.getSeconds())}`
})();

/** Tiene que coincidir EXACTAMENTE con la `release` que manda el SDK en
 *  `src/core/sentry.ts`; si no, los mapas quedan colgados de una versión que
 *  ningún evento menciona y el desminificado no ocurre. Ambos lados salen de
 *  `package.json` y del sello de build, así que no hay nada que sincronizar a
 *  mano. */
const release = `${pkg.name}@${build1}`

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  /* ─── Sourcemaps para Sentry ───────────────────────────────────────────────

     Sin esto los eventos del frontend llegan, pero con el stack minificado
     (`vendor-antd-D3f.js:1:48210`): se agrupan bien y no se pueden leer, que
     es justo para lo que se reportan.

     `loadEnv` con prefijo vacío lee TODAS las claves de los `.env`, no solo las
     `VITE_`. Eso es lo que permite tener las tres públicas junto al resto de la
     configuración y el token solo en el entorno.

     Cuidado con la precedencia, que con Bun no es la de Vite a secas: Bun carga
     `.env` en `process.env` al arrancar, y el último paso de `loadEnv` deja que
     `process.env` gane sobre los ficheros. Resultado: una clave presente en el
     `.env` local le gana a la de `.env.production` aunque construyas con
     `--mode production`. Por eso las tres van comentadas en el `.env` y solo
     activas en los ficheros de modo. En Docker no hay `.env` (está en
     `.dockerignore`), así que allí no hay ambigüedad.

     Y son tres públicas y un secreto, no cuatro iguales:
       · `SENTRY_URL`, `SENTRY_ORG`, `SENTRY_PROJECT` — van en `.env.production`
         y `.env.qas`, que se versionan. Son tan públicas como el DSN.
       · `SENTRY_AUTH_TOKEN` — autoriza a ESCRIBIR en la instancia, así que NO
         va en un fichero versionado. En local, en el `.env` (que está en
         gitignore); al desplegar, por entorno o como secreto del build.

     Ninguna lleva prefijo `VITE_`: eso las inlinearía en el bundle, y al token
     lo publicaría.

     Si falta cualquiera de las cuatro, la subida queda desactivada y el build
     sigue igual — mismo criterio que el DSN vacío. */
  const env = loadEnv(mode, __dirname, '')
  const leer = (clave: string) => (env[clave] || '').trim()

  const sentryAuthToken = leer('SENTRY_AUTH_TOKEN')
  const sentryUrl = leer('SENTRY_URL')
  const sentryOrg = leer('SENTRY_ORG')
  const sentryProject = leer('SENTRY_PROJECT')
  const subirSourcemaps = Boolean(sentryAuthToken && sentryUrl && sentryOrg && sentryProject)

  if (!subirSourcemaps) {
    console.log('[SENTRY] Subida de sourcemaps DESACTIVADA: define SENTRY_AUTH_TOKEN, ' +
      'SENTRY_URL, SENTRY_ORG y SENTRY_PROJECT para activarla.')
  }

  return {
    server: {
      port: 5004,
      open: true,
    },
    plugins: [
      react(),
      createHtmlPlugin({
        minify: false,
        inject: { data: { buildVersion: `${build1}.${hostname}.${date}` } }
      }),
      // El último de la lista: necesita ver los ficheros ya generados.
      subirSourcemaps && sentryVitePlugin({
        authToken: sentryAuthToken,
        url: sentryUrl,
        org: sentryOrg,
        project: sentryProject,
        release: { name: release },
        // La instancia es nuestra: nada de telemetría a sentry.io.
        telemetry: false,
        /*
          Por defecto el plugin avisa del fallo y deja terminar el build. Eso deja
          lo peor de los dos mundos: un despliegue cuyos stacks no se pueden leer
          y ningún rastro de ello salvo una línea perdida en el log — y los `.map`
          se borran igual, así que ni siquiera quedan para subirlos a mano.

          Si las cuatro variables están puestas es porque se pidió la subida, así
          que un fallo es un fallo. Si en algún entorno la instancia no se alcanza
          (un runner de CI sin ruta hasta ella), la salida es no definir las
          variables ahí, no tragarse el error.
        */
        errorHandler: (error) => {
          throw new Error(
            `[SENTRY] No se pudieron subir los sourcemaps de ${release}: ${error.message}. ` +
            'La instancia tiene que ser alcanzable desde donde se construye. Si no ' +
            'lo es, quita SENTRY_AUTH_TOKEN del entorno de build para desactivar la subida.'
          )
        },
        sourcemaps: {
          // Los `.map` no se publican: se suben a la instancia y se borran del
          // `dist` antes de que nginx pueda servirlos. Sentry los localiza por
          // los debug ids que el plugin inyecta en el bundle, no por el fichero.
          filesToDeleteAfterUpload: ['./dist/**/*.map'],
        },
      }),
    ],
    build: {
      // 'hidden' y no true: genera los `.map` pero sin el comentario
      // `//# sourceMappingURL`, así que el navegador no intenta descargarlos.
      sourcemap: subirSourcemaps ? 'hidden' : false,
      assetsInlineLimit: 0,
      rollupOptions: {
        plugins: [analyze({ summaryOnly: true, limit: 16 })],
        output: {
          minifyInternalExports: true,
          // Vite 8 (rolldown) exige que manualChunks sea una función.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            // Antes que la regla de react: la ruta de `@sentry/react` contiene
            // `/react/` y si no, caería en vendor-react e invalidaría su caché
            // cada vez que se actualice el SDK.
            if (id.includes('@sentry')) return 'vendor-sentry';
            if (
              id.includes('antd') ||
              id.includes('@ant-design') ||
              id.includes('rc-') ||
              id.includes('@rc-component')
            ) return 'vendor-antd';
            if (
              id.includes('react-router') ||
              id.includes('react-dom') ||
              id.includes('scheduler') ||
              /[\\/]react[\\/]/.test(id)
            ) return 'vendor-react';
          },
        } as any
      }
    },
    resolve: {
      alias: {
        "@src": path.resolve(__dirname, 'src'),
        "@assets": path.resolve(__dirname, 'src/assets'),
        "@components": path.resolve(__dirname, 'src/components'),
        "@styles": path.resolve(__dirname, 'src/styles'),
        "@pages": path.resolve(__dirname, 'src/pages'),
        "@core": path.resolve(__dirname, 'src/core'),
        "@providers": path.resolve(__dirname, 'src/providers'),
        "@layouts": path.resolve(__dirname, 'src/layouts'),
        "@services": path.resolve(__dirname, 'src/services'),
        "@modules": path.resolve(__dirname, 'src/modules'),
      }
    },
  }
})
