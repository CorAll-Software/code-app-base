import type { ReactNode } from "react";
import { useAuth } from "../providers/auth-provider";
import type { PermisoSlug } from "../core/permissions.constants";
import { NotFoundPage } from "./404.page";

/**
 * Envuelve el elemento de una ruta y verifica el permiso en vivo (contexto de auth).
 * Si el usuario no tiene acceso, muestra NotFound — mismo comportamiento que antes,
 * cuando las rutas sin permiso simplemente no se registraban.
 */
export const PermissionRoute = ({
  slug,
  children,
}: {
  slug?: PermisoSlug | PermisoSlug[];
  children: ReactNode;
}) => {
  const auth = useAuth();
  if (!auth.hasPermission(slug)) return <NotFoundPage />;
  return <>{children}</>;
};
