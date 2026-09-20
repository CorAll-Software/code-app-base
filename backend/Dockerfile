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
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/build ./build
COPY --from=prerelease /usr/src/app/assets ./assets
COPY --from=prerelease /usr/src/app/package.json .

USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "build/main.js" ]
