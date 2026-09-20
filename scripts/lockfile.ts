import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Regenera los lockfiles que usan las imágenes de Docker:
 * `backend/bun.lock` y `frontend/bun.lock`.
 *
 * Por qué existen además del de la raíz:
 * el despliegue construye cada servicio con su carpeta como contexto, así que
 * dentro del build no se alcanza el `bun.lock` del monorepo. Y sin lockfile,
 * `bun install --frozen-lockfile` NO falla: instala resolviendo de cero, y la
 * imagen acaba con versiones que nadie probó.
 *
 * Por qué hace falta un script y no basta `bun install`:
 * ejecutado dentro de un workspace, Bun escribe en el lockfile de la raíz. La
 * única forma de obtener uno propio es resolver fuera del árbol del monorepo,
 * que es lo que se hace aquí en un directorio temporal.
 *
 * Cuándo ejecutarlo: **cada vez que cambien las dependencias de un servicio.**
 *
 *     bun run lockfile
 *
 * Si se olvida, no se rompe nada en silencio: el build de Docker falla con
 * "lockfile had changes, but lockfile is frozen".
 */

const RAIZ = dirname(import.meta.dir);
const WORKSPACES = ['backend', 'frontend'];

for (const workspace of WORKSPACES) {
    const destino = join(RAIZ, workspace);
    const temporal = await mkdtemp(join(tmpdir(), `lockfile-${workspace}-`));

    try {
        await cp(join(destino, 'package.json'), join(temporal, 'package.json'));

        const proceso = Bun.spawnSync(['bun', 'install', '--lockfile-only'], {
            cwd: temporal,
            stdout: 'inherit',
            stderr: 'inherit',
        });

        if (!proceso.success) {
            console.error(`No se pudo resolver las dependencias de ${workspace}.`);
            process.exit(1);
        }

        await cp(join(temporal, 'bun.lock'), join(destino, 'bun.lock'));
        console.log(`${workspace}/bun.lock actualizado.`);
    } finally {
        await rm(temporal, { recursive: true, force: true });
    }
}
