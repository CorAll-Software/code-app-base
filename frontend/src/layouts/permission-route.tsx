import type { ReactNode } from "react";
import { useAuth } from "../providers/auth-provider";
import type { PermisoSlug } from "../core/permissions.constants";
import { NotFoundPage } from "./404.page";

/**
 * Envuelve el elemento de una ruta y verifica el permiso en vivo (contexto de auth).
 * Si el usuario no tiene acceso, muestra la misma pantalla que una ruta
 * inexistente, pero diciendo que es un problema de permisos.
 */
export const PermissionRoute = ({
  slug,
  children,
}: {
  slug?: PermisoSlug | PermisoSlug[];
  children: ReactNode;
}) => {
  const auth = useAuth();
  if (!auth.hasPermission(slug)) {
    return <NotFoundPage mensaje="No tienes permiso para ver esta página. Si lo necesitas, pídeselo a un administrador." />;
  }
  return <>{children}</>;
};
