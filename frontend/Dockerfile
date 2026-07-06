# 1️⃣ Dependencias (cacheadas mientras no cambie package.json)
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g bun
COPY package.json ./
RUN bun install

# 2️⃣ Build
FROM deps AS build
WORKDIR /app
COPY . .
ARG BUILD_MODE=prod
RUN bun run build:${BUILD_MODE}

# 3️⃣ Runtime
FROM nginx:alpine AS runtime
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
