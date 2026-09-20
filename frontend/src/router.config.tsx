import { Result } from "antd";
import type { ReactNode } from "react";
import type { RouteObject } from "react-router-dom";
import type { ComponentType } from "react";
import { NotFoundPage } from "./layouts/404.page";
import { Home } from "./layouts/home.page";
import { ProfilePage } from "./layouts/profile.page";
import { PermissionRoute } from "./layouts/permission-route";
import { PERMISSIONS, type PermisoSlug } from "./core/permissions.constants";

type LazyLoad = () => Promise<{ default: ComponentType }>;

type AppRoute = {
  path: string;
  label: string;
  slug?: PermisoSlug | PermisoSlug[];
  // Página con code-splitting (lazy del data router → activa navigation.state)
  load?: LazyLoad;
  // Elemento estático opcional (placeholders)
  element?: ReactNode;
};

const PlaceholderPage = ({ title }: { title: string }) => (
  <Result title={title} subTitle="Sección en implementación" />
);

export const APP_ROUTES: AppRoute[] = [
  // ── Módulos de negocio ─────────────────────────────────────────────────────
  // Agrega aquí las rutas del proyecto. Ejemplo con code-splitting:
  // { path: "clientes", label: "Clientes", slug: PERMISSIONS.CLIENTES.VIEW, load: () => import("./modules/clientes/pages/Clientes.page") },
  // Ejemplo de placeholder (sin `load` → muestra "Sección en implementación"):
  // { path: "reportes", label: "Reportes", slug: PERMISSIONS.REPORTES.VIEW },

  // ── Ajustes (Identidad, Accesos y Seguridad) ───────────────────────────────
  {
    path: "ajustes",
    label: "Ajustes",
    slug: [PERMISSIONS.USUARIOS.VIEW, PERMISSIONS.ROLES.VIEW, PERMISSIONS.AUDITORIA.VIEW],
  },
  {
    path: "ajustes/ajustes-usuarios",
    label: "Usuarios",
    slug: PERMISSIONS.USUARIOS.VIEW,
    load: () => import("./modules/equipo/pages/UsersManagement.page").then((m) => ({ default: m.UsersManagementPage })),
  },
  {
    path: "ajustes/ajustes-config",
    label: "Roles y permisos",
    slug: PERMISSIONS.ROLES.VIEW,
    load: () => import("./modules/configuracion/pages/RolesManagement.page").then((m) => ({ default: m.RolesManagementPage })),
  },
  {
    path: "ajustes/ajustes-auditoria",
    label: "Auditoría",
    slug: PERMISSIONS.AUDITORIA.VIEW,
    load: () => import("./modules/auditoria/pages/Auditoria.page").then((m) => ({ default: m.AuditoriaPage })),
  },
];

// ── Objetos de ruta para el data router (createBrowserRouter) ────────────────
const moduleRouteObjects: RouteObject[] = APP_ROUTES.map((route) => {
  if (route.load) {
    // `lazy` del data router: el chunk se carga como parte de la navegación,
    // por lo que useNavigation().state refleja la descarga (feedback de carga).
    return {
      path: route.path,
      lazy: async () => {
        const Comp = (await route.load!()).default;
        return {
          element: (
            <PermissionRoute slug={route.slug}>
              <Comp />
            </PermissionRoute>
          ),
        };
      },
    };
  }
  return {
    path: route.path,
    element: (
      <PermissionRoute slug={route.slug}>
        {route.element ?? <PlaceholderPage title={route.label} />}
      </PermissionRoute>
    ),
  };
});

export const childRoutes: RouteObject[] = [
  { index: true, element: <Home /> },
  ...moduleRouteObjects,
  { path: "profile", element: <ProfilePage /> },
  { path: "*", element: <NotFoundPage /> },
];
