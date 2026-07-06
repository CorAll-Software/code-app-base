import { Permission } from "./roles.service";

// ─────────────────────────────────────────────────────────────────────────────
// Construcción automática del árbol de permisos.
//
// El árbol se deriva por completo del `slug` de cada permiso (formato
// `modulo.submodulo.accion`). No hay catálogos de módulos ni etiquetas en duro:
// los grupos y sus nombres se infieren de los propios slugs, de modo que al
// agregar permisos nuevos el árbol se agrupa solo.
// ─────────────────────────────────────────────────────────────────────────────

export interface PermissionTreeNode {
  key: string;             // grupo: ruta del slug ("cartera.clientes") · hoja: id del permiso
  title: string;           // etiqueta visible
  isGroup: boolean;
  depth: number;           // 0 = módulo raíz
  children?: PermissionTreeNode[];
  // Solo en hojas (permisos):
  slug?: string;
  description?: string;
  permissionId?: number;
}

// Orden lógico de verbos de acción (universal, independiente del módulo).
const ACTION_PRIORITY = [
  "view", "view_all", "list", "create", "edit", "update",
  "delete", "manage", "approve", "export",
];

/** Convierte un segmento de slug en una etiqueta legible: `view_all` → `View All`. */
export function humanizeSegment(segment: string): string {
  return segment
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

interface GroupAcc {
  key: string;
  title: string;
  depth: number;
  groups: Map<string, GroupAcc>;
  leaves: Permission[];
}

const makeGroup = (key: string, title: string, depth: number): GroupAcc => ({
  key, title, depth, groups: new Map(), leaves: [],
});

const leafAction = (p: Permission): string => (p.slug || "").split(".").pop() || "";

function sortLeaves(a: Permission, b: Permission): number {
  const ia = ACTION_PRIORITY.indexOf(leafAction(a));
  const ib = ACTION_PRIORITY.indexOf(leafAction(b));
  if (ia !== ib) {
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  }
  return (a.name || "").localeCompare(b.name || "");
}

function convertGroup(acc: GroupAcc): PermissionTreeNode {
  const childGroups = [...acc.groups.values()]
    .map(convertGroup)
    .sort((a, b) => a.title.localeCompare(b.title));

  const leaves: PermissionTreeNode[] = acc.leaves
    .slice()
    .sort(sortLeaves)
    .map((p) => ({
      key: String(p.id),
      title: p.name,
      slug: p.slug,
      description: p.description,
      isGroup: false,
      depth: acc.depth + 1,
      permissionId: p.id,
    }));

  return {
    key: acc.key,
    title: acc.title,
    isGroup: true,
    depth: acc.depth,
    children: [...childGroups, ...leaves],
  };
}

/** Agrupa los permisos en un árbol jerárquico a partir de sus slugs. */
export function buildPermissionTree(permissions: Permission[]): PermissionTreeNode[] {
  const roots = new Map<string, GroupAcc>();

  for (const p of permissions) {
    const parts = (p.slug || "otros").split(".").filter(Boolean);
    // Todos los segmentos menos la acción forman la ruta de grupos.
    // Si el slug solo tiene un segmento, ese segmento es el grupo.
    const groupParts = parts.length > 1 ? parts.slice(0, -1) : parts.slice(0, 1);

    let level = roots;
    let path = "";
    let depth = 0;
    let acc: GroupAcc | null = null;

    for (const part of groupParts) {
      path = path ? `${path}.${part}` : part;
      if (!level.has(part)) {
        level.set(part, makeGroup(path, humanizeSegment(part), depth));
      }
      acc = level.get(part)!;
      level = acc.groups;
      depth++;
    }

    acc!.leaves.push(p);
  }

  return [...roots.values()]
    .map(convertGroup)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Todas las claves de grupo del árbol (para expandir/colapsar todo). */
export function collectGroupKeys(nodes: PermissionTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (n: PermissionTreeNode) => {
    if (n.isGroup) {
      keys.push(n.key);
      n.children?.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return keys;
}

/** Todas las claves de hoja (ids de permiso) bajo un nodo o lista de nodos. */
export function collectLeafKeys(nodes: PermissionTreeNode | PermissionTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (n: PermissionTreeNode) => {
    if (n.isGroup) n.children?.forEach(walk);
    else keys.push(n.key);
  };
  (Array.isArray(nodes) ? nodes : [nodes]).forEach(walk);
  return keys;
}

/** Filtra permisos por texto sobre nombre, slug o descripción. */
export function filterPermissions(permissions: Permission[], search: string): Permission[] {
  const q = search.trim().toLowerCase();
  if (!q) return permissions;
  return permissions.filter(
    (p) =>
      p.name?.toLowerCase().includes(q) ||
      p.slug?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q),
  );
}
