// Tipos transversales del núcleo. Los tipos propios de cada módulo de negocio
// viven en su carpeta `modules/<modulo>/services/`.

export interface UserSession {
  id: number;
  email: string;
  names: string;
  telefono: any;
  dni?: string | null;
  avatar: any;
  roles: Role[];
  permisos: string[];
}

export interface Role {
  id: number;
  name: string;
  module: string;
  is_system?: boolean;
}
