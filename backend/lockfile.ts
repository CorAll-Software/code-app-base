

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Regenera `backend/bun.lock`, el lockfile que usa la imagen de Docker.
 *
 * Por qué existe un segundo lockfile:
 * el despliegue construye cada servicio con su carpeta como contexto, así que
 * dentro del build de Docker no se puede alcanzar el `bun.lock` de la raíz del
 * monorepo. Y sin lockfile, `bun install --frozen-lockfile` NO falla: instala
 * resolviendo de cero, y la imagen acaba con versiones que nadie probó.
 *
 * Por qué hace falta un script y no basta `bun install`:
 * ejecutado dentro de `backend/`, Bun detecta que es un workspace y escribe en
 * el lockfile de la raíz, no aquí. La única forma de obtener uno propio es
 * resolver las dependencias fuera del árbol del monorepo, que es lo que hace
 * este script en un directorio temporal.
 *
 * Cuándo ejecutarlo: **cada vez que cambien las dependencias del backend.**
 *
 *     cd backend && bun run lockfile
 *
 * Si se olvida, no se rompe nada en silencio: el build de Docker falla con
 * "lockfile had changes, but lockfile is frozen".
 */

const raiz = import.meta.dir;
const temporal = await mkdtemp(join(tmpdir(), 'lockfile-backend-'));

try {
    await cp(join(raiz, 'package.json'), join(temporal, 'package.json'));

    const proceso = Bun.spawnSync(['bun', 'install', '--lockfile-only'], {
        cwd: temporal,
        stdout: 'inherit',
        stderr: 'inherit',
    });

    if (!proceso.success) {
        console.error('No se pudo resolver las dependencias.');
        process.exit(1);
    }

    await cp(join(temporal, 'bun.lock'), join(raiz, 'bun.lock'));
    console.log('backend/bun.lock actualizado.');
} finally {
    await rm(temporal, { recursive: true, force: true });
}
