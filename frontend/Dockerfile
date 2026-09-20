# Imagen del frontend. El contexto de build es esta carpeta:
#
#     docker build -f frontend/Dockerfile frontend/
#
# Por eso `frontend/bun.lock` existe además del de la raíz del monorepo: desde
# aquí dentro aquel no se alcanza, y sin lockfile `bun install --frozen-lockfile`
# NO falla — instala resolviendo de cero y la imagen acaba con versiones que
# nadie probó. Se regenera con `bun run lockfile` en la raíz; ver
# scripts/lockfile.ts.

# ── Dependencias ─────────────────────────────────────────────────────────────
# Imagen oficial de Bun en vez de node + `npm install -g bun`: evita instalar
# Bun en cada build y lo deja fijado por la etiqueta.
# Solo manifiesto y lockfile: la capa se recachea únicamente cuando cambian.
FROM oven/bun:latest AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
# BUILD_MODE elige el fichero de entorno: `prod` usa .env.production y `qas`
# usa .env.qas, que es de donde salen los %VITE_*% del index.html.
FROM deps AS build
WORKDIR /app
COPY . .
ARG BUILD_MODE=prod
RUN bun run build:${BUILD_MODE}

# ── Runtime ──────────────────────────────────────────────────────────────────
# alpine-slim y no alpine: la variante completa trae los modulos image-filter,
# xslt, geoip, njs y acme, y con ellos libxml2, libxslt, libgd, tiff, libwebp,
# freetype, libpng y curl. Aqui solo se sirven ficheros estaticos y ninguno de
# esos modulos aparece en nginx.conf: 71 paquetes bajan a 21 y 64 MB a 14.
FROM nginx:alpine-slim AS runtime
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
