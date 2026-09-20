

import pkg from './package.json';

/**
 * Build del backend, con el sello del despliegue horneado dentro del bundle.
 *
 * El sello se calcula **al construir**, no al arrancar. Si se tomara la hora en
 * el arranque, cada reinicio del proceso sería una "release" distinta en Sentry
 * y el historial no serviría para nada. Horneado en el bundle, todas las
 * instancias de un mismo despliegue reportan la misma versión.
 *
 * Es el equivalente a lo que hace `frontend/vite.config.ts`, que inyecta su
 * sello en el `<meta build-version>` del index.html.
 *
 * El sello es `<equipo>.<marca>`:
 *   · equipo — `HOSTNAME`, que dentro de Docker es el id del contenedor que
 *     construye, así que cambia solo en cada build.
 *   · marca  — la hora en base 36: corta y creciente, para ordenar dos builds
 *     del mismo día.
 *
 * La versión semántica no se toca aquí: sale de `package.json`, que es su única
 * fuente.
 */

/** Resolución de la marca de tiempo: 10 s bastan y la dejan en 6 caracteres. */
const RESOLUCION_MS = 10_000;
/** Base 36 = dígitos + letras: la representación más corta y aún legible. */
const BASE_ALFANUMERICA = 36;
/** Largo del id corto de contenedor, que es la forma habitual de acortarlo. */
const LARGO_EQUIPO = 12;
/** Cuando no hay ni HOSTNAME ni USERNAME en el entorno. */
const EQUIPO_DESCONOCIDO = 'LOCAL';

const marcaDeTiempo = () =>
    Math.floor(Date.now() / RESOLUCION_MS).toString(BASE_ALFANUMERICA).toUpperCase();

/** Los nombres de equipo traen espacios ("LOQ 15IRX10") y no pueden romper el
 *  identificador de release. */
const nombreDeEquipo = () =>
    (process.env.HOSTNAME || process.env.USERNAME || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, LARGO_EQUIPO) || EQUIPO_DESCONOCIDO;

const sello = `${nombreDeEquipo()}.${marcaDeTiempo()}`;

const resultado = await Bun.build({
    entrypoints: ['src/index.ts'],
    target: 'bun',
    outdir: 'build',
    naming: 'main.js',
    define: {
        __SELLO_BUILD__: JSON.stringify(sello),
    },
});

if (!resultado.success) {
    for (const log of resultado.logs) console.error(log);
    process.exit(1);
}

console.log(`Build listo · versión ${pkg.version}+${sello}`);
