// Tipos de la bitácora de auditoría.
// Espejo de `auditoria.log` (postgres/auditoria/auditoria-tables.sql).

/**
 * `auditoria.enum_operacion`. Las cinco primeras las escribe SOLO el trigger de
 * la base; las demás las declaran los procedimientos y la capa HTTP, porque
 * PostgreSQL no dispara triggers en SELECT ni en un intento denegado.
 */
export type OperacionAuditoria =
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "BAJA"
  | "REACTIVACION"
  | "LECTURA"
  | "DESCARGA"
  | "EXPORTACION"
  | "LOGIN"
  | "LOGIN_FALLIDO"
  | "ACCESO_DENEGADO";

/** Diff de un UPDATE: qué valor tenía el campo y con cuál quedó. */
export interface CambioCampo {
  antes: unknown;
  despues: unknown;
}

export interface EventoAuditoria {
  id_log: number;
  esquema: string;
  entidad: string;
  id_registro?: string | null;
  operacion: OperacionAuditoria | string;

  usuario_id?: number | null;
  usuario?: string | null;
  email_usuario?: string | null;
  rol?: string | null;
  /** core.user_sessions.id: desde qué dispositivo se hizo. */
  sesion_id?: string | null;

  id_caso?: string | null;

  /** Solo en UPDATE/BAJA/REACTIVACION: {columna: {antes, despues}}. */
  campos?: Record<string, CambioCampo> | null;
  /** Fila completa: `datos_antes` en DELETE, `datos_despues` en INSERT. */
  datos_antes?: Record<string, unknown> | null;
  datos_despues?: Record<string, unknown> | null;

  detalle?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  endpoint?: string | null;
  /** Agrupa las filas producidas por una misma transacción. */
  txid?: number | null;

  /** Epoch en segundos, como todo el sistema: formatear con dayjs. */
  fecha: number;
}

export interface FiltrosDisponibles {
  entidades: { esquema: string; entidad: string; eventos: number }[];
  operaciones: { operacion: string; eventos: number }[];
  usuarios: { usuario_id: number; usuario: string; rol?: string | null; eventos: number }[];
  total: number;
  desde?: number | null;
  hasta?: number | null;
}

export interface CoberturaAuditoria {
  esquema: string;
  tabla: string;
  auditada: boolean;
  eventos: number;
}

// Etiqueta y color de cada operación. Se separan las escrituras (colores
// fuertes) de las consultas (tonos neutros) para que la línea de tiempo se lea
// de un vistazo: lo que altera datos tiene que saltar antes que lo que solo los
// mira.
export const OPERACIONES: { value: OperacionAuditoria; label: string; color: string }[] = [
  { value: "INSERT", label: "Creación", color: "green" },
  { value: "UPDATE", label: "Modificación", color: "blue" },
  { value: "DELETE", label: "Eliminación", color: "red" },
  { value: "BAJA", label: "Baja", color: "volcano" },
  { value: "REACTIVACION", label: "Reactivación", color: "cyan" },
  { value: "LECTURA", label: "Consulta", color: "default" },
  { value: "DESCARGA", label: "Descarga", color: "purple" },
  { value: "EXPORTACION", label: "Exportación", color: "purple" },
  { value: "LOGIN", label: "Inicio de sesión", color: "default" },
  { value: "LOGIN_FALLIDO", label: "Inicio fallido", color: "orange" },
  { value: "ACCESO_DENEGADO", label: "Acceso denegado", color: "red" },
];

export const OPERACIONES_MAP = new Map(OPERACIONES.map((o) => [o.value as string, o]));

/**
 * Nombre legible de las tablas del núcleo. Una tabla que no esté aquí se
 * muestra tal cual: es preferible a inventarle un nombre y esconder de qué
 * tabla se está hablando. Al agregar un módulo, anexa aquí sus entidades.
 */
export const ENTIDADES_ETIQUETA: Record<string, string> = {
  users: "Usuario",
  roles: "Rol",
  permissions: "Permiso",
  role_permissions: "Permiso de rol",
  user_roles: "Rol de usuario",
  user_sessions: "Sesión",
};

export const etiquetaEntidad = (entidad: string) => ENTIDADES_ETIQUETA[entidad] || entidad;

/** `nota_credito` → `Nota Credito`. Para nombres de columna en el diff. */
export const humanizarCampo = (campo: string): string =>
  (campo || "")
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** Representación legible de un valor del diff, sin perder el matiz de vacío. */
export const formatearValor = (valor: unknown): string => {
  if (valor === null || valor === undefined) return "—";
  if (valor === "") return "(vacío)";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
};
