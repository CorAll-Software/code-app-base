import { setTimeZone } from "bun:jsc";

export const configServer = {
  version: "0.1.0",
  team: process.env.TEAM_NAME || "Mi Empresa",
  timeZone: "America/Lima",
  port: parseInt(process.env.PORT || "3000"),
  domain: process.env.DOMAIN_FRONTEND || "http://localhost:5004",
  auth: {
    secret: process.env.JWT_SECRET || "default_secret",
    expiresIn: process.env.JWT_EXPIRE_IN ? parseInt(process.env.JWT_EXPIRE_IN) : 7 * 24 * 60 * 60, // 7 días por defecto
  },
  db: {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME || "app_base",
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || "5432"),
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || "10"),
  },
  email: {
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
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
    expiresIn: process.env.AWS_S3_EXPIRES_IN ? parseInt(process.env.AWS_S3_EXPIRES_IN) : 3600,
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
  webhooks: {
    emailSecret: process.env.WEBHOOK_EMAIL_SECRET || "",
  },
};

//! Set timezone
setTimeZone(configServer.timeZone);
