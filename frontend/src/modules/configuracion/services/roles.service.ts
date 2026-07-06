import { GET, POST, PUT } from '@src/core/http';

export interface Permission {
    id: number;
    name: string;
    slug: string;
    description: string;
    status: boolean;
}

export interface Role {
    id: number;
    name: string;
    description: string;
    status: boolean; // Logical delete
    enable: boolean; // Active/Inactive
    is_system: boolean; // System role (protected)
    permissions?: number[]; // Arreglo de IDs de permisos asociados
}

const path = 'roles';

export const rolesService = {
    getRoles: (params?: { name?: string; enable?: boolean; page?: number; page_size?: number }): Promise<{ data: Role[], total: number }> =>
        GET<any>(path, { params })
            .then(res => {
                const page = params?.page || 1;
                const pageSize = params?.page_size || 10;
                
                if (res && Array.isArray(res.data)) return { data: res.data, total: res.total || res.data.length };
                
                if (Array.isArray(res)) {
                    let filtered = res;
                    if (params?.name) {
                        const s = params.name.toLowerCase();
                        filtered = filtered.filter((r: Role) => r.name.toLowerCase().includes(s));
                    }
                    if (params?.enable !== undefined && params?.enable !== null) {
                        const searchEnable = String(params.enable) === 'true';
                        filtered = filtered.filter((r: Role) => r.enable === searchEnable);
                    }

                    return {
                        data: filtered.slice((page - 1) * pageSize, page * pageSize),
                        total: filtered.length
                    };
                }
                return { data: [], total: 0 };
            })
            .catch(error => {
                console.error('Error in rolesService.getRoles:', error);
                return { data: [], total: 0 };
            }),

    getPermissions: (): Promise<Permission[]> =>
        GET<any>('permissions')
            .then(res => Array.isArray(res) ? res : (res?.data || []))
            .catch(error => {
                console.error('Error in rolesService.getPermissions:', error);
                return [];
            }),

    createRole: (params: any): Promise<Role | null> =>
        POST<any>(path, {
            msgSuccess: 'Rol creado correctamente',
            msgError: 'Error al crear el rol',
            params
        }).then(res => res as Role)
            .catch(error => {
                console.error('Error creating role:', error);
                return null;
            }),

    updateRole: (params: any): Promise<Role | null> =>
        PUT<any>(path, {
            msgSuccess: 'Rol actualizado correctamente',
            msgError: 'Error al actualizar el rol',
            params
        }).then(res => res as Role)
            .catch(error => {
                console.error('Error updating role:', error);
                return null;
            }),

    toggleRoleStatus: (role: Role): Promise<boolean> =>
        PUT(path, {
            msgSuccess: `Rol ${role.enable ? 'desactivado' : 'activado'} correctamente`,
            msgError: 'Error al cambiar el estado del rol',
            params: { ...role, enable: !role.enable }
        }).then(() => true)
            .catch(error => {
                console.error('Error toggling role status:', role.name, error);
                return false;
            }),

    deleteRole: (id: number): Promise<boolean> =>
        PUT(path, {
            msgSuccess: 'Rol eliminado correctamente',
            msgError: 'Error al eliminar el rol',
            params: { id, status: false }
        }).then(() => true)
            .catch(error => {
                console.error('Error deleting role:', error);
                return false;
            })
};
