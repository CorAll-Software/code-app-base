import { generateListMap } from "./parse";

// =============================================================================
// Listas de enumeraciones
// Los `value` coinciden EXACTAMENTE con los ENUM de PostgreSQL (mayúsculas),
// de modo que round-trip directo con la API sin mapeos intermedios.
// Fuente: postgres/<modulo>/<modulo>-tables.sql
//
// Patrón: una lista por ENUM de BD, con label legible y color de tag AntD.
// `generateListMap` devuelve la lista + un mapa por `value` para lookups O(1).
// =============================================================================

// ── Ejemplo (eliminar al crear las listas reales del proyecto) ───────────────
// <esquema>.enum_estado
export const ESTADOS_EJEMPLO = generateListMap<{
  value: "ACTIVO" | "INACTIVO";
  label: string;
  color: string;
}>([
  { value: "ACTIVO", label: "Activo", color: "success" },
  { value: "INACTIVO", label: "Inactivo", color: "default" },
]);
