# Imagen del backend. El contexto de build es esta carpeta:
#
#     docker build -f backend/Dockerfile backend/
#
# Por eso `backend/bun.lock` existe además del de la raíz del monorepo: desde
# aquí dentro aquel no se alcanza, y sin lockfile `bun install --frozen-lockfile`
# NO falla — instala resolviendo de cero y la imagen acaba con versiones que
# nadie probó. Se regenera con `bun run lockfile` cuando cambian las
# dependencias; ver lockfile.ts.
#
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# ── Dependencias ─────────────────────────────────────────────────────────────
# Solo manifiesto y lockfile: estas capas se recachean únicamente cuando
# cambian, no en cada cambio de código.
FROM base AS install

# Con devDependencies: hacen falta para construir.
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Sin devDependencies: es el que viaja en la imagen final.
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

ENV NODE_ENV=production
RUN bun run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS release
# Lo que lee process.env al arrancar (p. ej. el entorno de Sentry) lo necesita.
ENV NODE_ENV=production
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/build ./build
COPY --from=prerelease /usr/src/app/assets ./assets
COPY --from=prerelease /usr/src/app/package.json .

USER bun
EXPOSE 3000/tcp

# Health check: /api/health hace PING a Redis y SELECT 1 a Postgres (503 si
# alguno falla). La imagen de bun no trae curl, así que se usa su fetch.
# Ojo: Docker solo marca el contenedor como unhealthy, no lo reinicia (eso lo
# hace Swarm/Kubernetes o un sidecar tipo autoheal).
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD bun -e "fetch('http://localhost:' + (process.env.PORT || '3000') + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT [ "bun", "run", "build/main.js" ]
