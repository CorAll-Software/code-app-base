import { testDbConnection } from "@core/db/connection";
import { Elysia } from "elysia";
import { readFileSync } from "fs";

// ── Núcleo · Identidad, Accesos y Seguridad ─────────────────────────────────
import { AuthWs } from "@modules/core/auth.ws";
import { AuthApi } from "@modules/core/auth.api";
import { UsersApi } from "@modules/core/users.api";
import { RolesApi } from "@modules/core/roles.api";
import { PermissionsApi } from "@modules/core/permissions.api";

// ── Módulos de negocio ──────────────────────────────────────────────────────
// Registra aquí los módulos del proyecto. Ejemplo:
// import { ClientesApi } from "@modules/clientes/clientes.api";

const handleHome = async ({ status }) => {
  let version = "";
  const d = new Date();

  // Consulta simple a Base de datos
  const queryResult = await testDbConnection();
  if (queryResult.error) {
    return status(500, { message: queryResult.error });
  }

  try {
    const path = "deploy.txt";
    version = readFileSync(path).toString();
  } catch (error) {
    version = "No version";
  }
  return {
    message: "API · Plantilla base CorAll",
    version,
    time: Date.now(),
    date: d.toISOString(),
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
    TZ: d.getTimezoneOffset(),
    EnvTz: process.env.TZ,
  };
};

export const routerApi = new Elysia()
  .get("/", handleHome)

  // Núcleo
  .use(AuthApi)
  .use(UsersApi)
  .use(RolesApi)
  .use(PermissionsApi);

// Módulos de negocio
// .use(ClientesApi)

export const routerWs = new Elysia({
  websocket: {
    idleTimeout: 1000 * 60 * 60 * 12, // 12 horas
  },
})
  .use(AuthWs);
