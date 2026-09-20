import { GET, PUT, POSTFormData, PUTFormData, DELETE } from '@src/core/http';

export interface UserData {
    id: number;
    names?: string;
    first_name?: string;
    last_name?: string;
    email: string;
    phone?: string | null;
    telefono?: string | null;
    status: boolean;
    enable: boolean;
    dni?: string | null;
    foto_url?: string | null;
    cargo?: string | null;

    // Roles
    rol_sistema?: number[];
    is_system_user?: boolean;
}

const path = 'users';

export const usersService = {
    getUsersCombo: (): Promise<UserData[]> =>
        GET<any>(`${path}/combo`)
            .then(res => Array.isArray(res) ? res : (res?.data?.data || res?.data || []))
            .catch(() => []),

    getUsers: (): Promise<UserData[]> =>
        GET<any>(path)
            .then(res => Array.isArray(res) ? res : (res?.data?.data || res?.data || []))
            .catch(() => []),

    getPaginatedUsers: (params?: any): Promise<{ data: UserData[], total: number }> =>
        GET<any>(path, { params })
            .then(res => {
                if (res && Array.isArray(res.data)) return { data: res.data, total: res.total || res.data.length };
                if (Array.isArray(res)) {
                    let filtered = res as UserData[];
                    if (params?.search) {
                        const s = params.search.toLowerCase();
                        filtered = filtered.filter((u) =>
                            (u.names?.toLowerCase().includes(s)) ||
                            (u.first_name?.toLowerCase().includes(s)) ||
                            (u.last_name?.toLowerCase().includes(s)) ||
                            (u.email?.toLowerCase().includes(s)) ||
                            (u.cargo?.toLowerCase().includes(s))
                        );
                    }
                    if (params?.enable !== undefined && params?.enable !== null) {
                        const searchEnable = String(params.enable) === 'true';
                        filtered = filtered.filter(u => u.enable === searchEnable);
                    }
                    const page = params?.page || 1;
                    const pageSize = params?.page_size || 10;
                    return { data: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length };
                }
                return { data: [], total: 0 };
            })
            .catch(() => ({ data: [], total: 0 })),

    getUserById: (id: number): Promise<UserData | null> =>
        GET<any>(`${path}/${id}`)
            .then(res => res as UserData)
            .catch(() => null),

    createUser: (params: any): Promise<UserData | null> => {
        const formData = buildFormData(params);
        return POSTFormData<any>(path, {
            msgSuccess: 'Usuario creado correctamente',
            msgError: 'Error al crear el usuario',
            params: formData
        }).then(res => res as UserData).catch(() => null);
    },

    updateUser: (params: any): Promise<UserData | null> => {
        const formData = buildFormData(params);
        return PUTFormData<any>(path, {
            msgSuccess: 'Usuario actualizado correctamente',
            msgError: 'Error al actualizar el usuario',
            params: formData
        }).then(res => res as UserData).catch(() => null);
    },

    deleteUser: (user: UserData): Promise<boolean> =>
        PUT(path, {
            msgSuccess: 'Usuario eliminado correctamente',
            msgError: 'Error al eliminar el usuario',
            params: { ...user, status: false }
        }).then(() => true).catch(() => false),

    changePassword: (params: any): Promise<boolean> =>
        PUT(`${path}/change-password`, {
            msgSuccess: 'Contraseña cambiada correctamente',
            msgError: 'Error al cambiar la contraseña',
            params
        }).then(() => true).catch(() => false),

    uploadFoto: (userId: number, file: File): Promise<{ foto_url: string } | null> => {
        const formData = new FormData();
        formData.append('foto', file);
        return POSTFormData<any>(`${path}/${userId}/foto`, {
            msgSuccess: 'Foto actualizada correctamente',
            msgError: 'Error al subir la foto',
            params: formData
        }).then(res => res as { foto_url: string }).catch(() => null);
    },

    deleteFoto: (userId: number): Promise<boolean> =>
        DELETE(`${path}/${userId}/foto`, {
            msgSuccess: 'Foto eliminada',
            msgError: 'Error al eliminar la foto',
        }).then(() => true).catch(() => false),
};

function buildFormData(params: any): FormData {
    const formData = new FormData();

    for (const key of Object.keys(params)) {
        if (key === 'foto') continue;

        if (Array.isArray(params[key]) || (typeof params[key] === 'object' && params[key] !== null && !(params[key] instanceof File))) {
            formData.append(key, JSON.stringify(params[key]));
        } else if (params[key] !== undefined && params[key] !== null) {
            formData.append(key, String(params[key]));
        }
    }

    return formData;
}
