import {
  AuditOutlined,
  FileSearchOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { PERMISSIONS, type PermisoSlug } from "./core/permissions.constants";

interface MenuItem {
  label: React.ReactNode;
  icon?: React.ReactNode;
  key: string;
  type?: "group";
  url?: string;           // destino explícito — usado para hojas bajo un submenú
  slug?: PermisoSlug | PermisoSlug[];
  children?: MenuItem[];
}

// Agrega aquí las entradas de los módulos de negocio. Reglas:
// - `key` = segmento de la URL (sin "/"), salvo que se indique `url`.
// - `slug` controla la visibilidad: sin permiso → el ítem no se muestra.
// - Un ítem con `children` es un submenú; su `slug` es la unión de los hijos.
export const menu: MenuItem[] = [
  // ── Módulos de negocio ──────────────────────────────────────────────────────
  // {
  //   key: "clientes",
  //   label: "Clientes",
  //   icon: <TeamOutlined />,
  //   slug: PERMISSIONS.CLIENTES.VIEW,
  // },

  // ── Ajustes (Identidad, Accesos y Seguridad) ────────────────────────────────
  {
    key: "ajustes",
    label: "Ajustes",
    icon: <SettingOutlined />,
    slug: [
      PERMISSIONS.USUARIOS.VIEW,
      PERMISSIONS.ROLES.VIEW,
      PERMISSIONS.AUDITORIA.VIEW,
    ],
    children: [
      { key: "ajustes-usuarios", label: "Usuarios", icon: <TeamOutlined />, url: "/ajustes/ajustes-usuarios", slug: PERMISSIONS.USUARIOS.VIEW },
      { key: "ajustes-config", label: "Roles y permisos", icon: <AuditOutlined />, url: "/ajustes/ajustes-config", slug: PERMISSIONS.ROLES.VIEW },
      { key: "ajustes-auditoria", label: "Auditoría", icon: <FileSearchOutlined />, url: "/ajustes/ajustes-auditoria", slug: PERMISSIONS.AUDITORIA.VIEW },
    ],
  },
];
