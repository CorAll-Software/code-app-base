import { setTimeZone } from "bun:jsc";
import pkg from "../package.json";

// Cap: normalizamos el endpoint para garantizar la barra final que exige el widget.
const rawCapEndpoint = (process.env.CAP_API_ENDPOINT || "").trim();
const capApiEndpoint = rawCapEndpoint ? `${rawCapEndpoint.replace(/\/+$/, "")}/` : "";
const capSecretKey = (process.env.CAP_SECRET_KEY || "").trim();

/**
 * Versión del despliegue, p. ej. `1.0.0+8245FA84F8F4.2YKAUR`.
 *
 * El número semántico sale de `package.json`, que es su única fuente. El sello
 * que lo acompaña lo hornea `build.ts` en el bundle al construir, y distingue
 * un despliegue de otro. Se ve en `GET /api/` y viaja en cada evento de Sentry,
 * así que identifica el despliegue exacto del que salió un fallo.
 *
 * Ejecutando desde el código fuente el identificador no existe; `typeof` sobre
 * uno no declarado no lanza, así que cae al sello de abajo.
 */
declare const __SELLO_BUILD__: string;
const SELLO_SIN_COMPILAR = "dev";
const sello = typeof __SELLO_BUILD__ !== "undefined" ? __SELLO_BUILD__ : SELLO_SIN_COMPILAR;

const version = `${pkg.version}+${sello}`;

// Entorno que se reporta a Sentry. El Dockerfile ya exporta NODE_ENV=production,
// así que un despliegue con Docker queda en "production" sin tocar nada.
const sentryEnvironment = (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development").trim();

export const configServer = {
  /** Nombre del paquete: única fuente, se renombra en `package.json`. */
  appName: pkg.name,
  version,
  team: process.env.TEAM_NAME || "Mi Empresa",
  timeZone: process.env.TZ || "America/Lima",
  port: parseInt(process.env.PORT || "3000", 10),
  domain: process.env.DOMAIN_FRONTEND || "http://localhost:5004",
  auth: {
    secret: process.env.JWT_SECRET || "default_secret",
    // Access token (JWT): vida corta, se renueva con el refresh token.
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRE_IN ? parseInt(process.env.JWT_ACCESS_EXPIRE_IN, 10) : 15 * 60, // 15 min por defecto
    // Sesión / refresh token rotativo: se extiende en cada renovación.
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRE_IN ? parseInt(process.env.JWT_REFRESH_EXPIRE_IN, 10) : 7 * 24 * 60 * 60, // 7 días por defecto
    // Días que se conservan las sesiones cerradas antes de purgarlas de la BD.
    sessionRetentionDays: parseInt(process.env.SESSION_RETENTION_DAYS || "30", 10),
  },
  db: {
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST,
    database: process.env.DB_NAME || "postgres",
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || "10", 10),
  },
  email: {
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    secure: process.env.EMAIL_SECURE === "true" || false,
    user: process.env.EMAIL_USER || "",
    password: process.env.EMAIL_PASSWORD || "",
    formWeb: process.env.EMAIL_FORM_WEB || "",
  },
  s3: {
    baseUrl: process.env.AWS_S3_BASE_URL!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    bucketName: process.env.AWS_S3_BUCKET_NAME!,
    bucketNamePublic: process.env.AWS_S3_BUCKET_NAME_PUBLIC || "",
    expiresIn: process.env.AWS_S3_EXPIRES_IN ? parseInt(process.env.AWS_S3_EXPIRES_IN, 10) : 3600,
    paths: {
      // Núcleo
      userAvatars: "user-avatars/",
      usuarios: "usuarios/",
      // Agrega aquí las rutas de los módulos de negocio, p.ej.:
      // documentos: "clientes/documentos/",
    },
  },
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
  /**
   * Cap · CAPTCHA autoalojado (https://trycap.dev).
   * Se activa solo cuando ambas variables están definidas; mientras no lo estén
   * (caso plantilla recién clonada) los endpoints públicos no exigen token.
   */
  captcha: {
    // Endpoint público de la instancia, con barra final: https://<instancia>/<siteKey>/
    apiEndpoint: capApiEndpoint,
    // Clave secreta: solo servidor, nunca se expone al navegador.
    secretKey: capSecretKey,
    enabled: Boolean(capApiEndpoint && capSecretKey),
    timeoutMs: parseInt(process.env.CAP_TIMEOUT_MS || "8000", 10),
  },
  webhooks: {
    emailSecret: process.env.WEBHOOK_EMAIL_SECRET || "",
  },
  /**
   * Sentry · reporte de errores (instancia autoalojada).
   * Mismo DSN que el frontend: el DSN no es un secreto, solo autoriza a enviar.
   * Vacío = desactivado, igual que Cap (caso plantilla recién clonada).
   *
   * En `development` queda apagado aunque haya DSN, para que una copia local
   * del `.env` no ensucie el proyecto de producción. Es el mismo criterio que
   * usa el frontend, que se apaga en localhost.
   */
  sentry: {
    dsn: (process.env.SENTRY_DSN || "").trim(),
    environment: sentryEnvironment,
    enabled: Boolean(process.env.SENTRY_DSN?.trim()) && sentryEnvironment !== "development",
    release: `${pkg.name}@${version}`,
    serverName: process.env.SENTRY_SERVER_NAME || process.env.HOSTNAME || "",
    timeoutMs: parseInt(process.env.SENTRY_TIMEOUT_MS || "5000", 10),
  },
};

//! Set timezone
setTimeZone(configServer.timeZone);
