import { UserSession } from '@src/core/types';
import { createContext, useContext, useEffect, useState } from 'react';
import { useFeedback } from './message.provider';
import { PermisoSlug, SYSTEM_ROLES } from '@src/core/permissions.constants';
import { useProyectosStore } from '@src/store/proyectos.store';
import { LOCAL_STORAGE_KEYS } from '@src/core/constants';

export interface IAuthContext {
    user: UserSession | null;
    expiredIn: number;
    startTime: number;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    login: (userData: any, expiredIn: number) => void;
    logout: () => void;
    isAuthenticated: () => boolean;
    isForcedChangePassword: () => boolean;
    hasPermission: (permiso: PermisoSlug | PermisoSlug[]) => boolean;
    refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext(null);

export const useAuth = (): IAuthContext => useContext(AuthContext);

export const AuthProvider = ({ children }) => {

    const [user, setUser] = useState<UserSession | null>(null);
    const [permissions, setPermissions] = useState<Set<string>>(new Set());
    const [expiredIn, setExpiredIn] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const { message } = useFeedback();

    const login = (userData, expiredIn) => {
        setUser(userData);
        setExpiredIn(expiredIn);
        if (userData.permisos) {
            setPermissions(new Set(userData.permisos));
        }
        // Hidratar el store de proyectos con los datos del login
        useProyectosStore.getState().setProyectos(userData.proyectos || []);
    };

    const logout = () => {
        try {
            const token = localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN);
            if (token) {
                fetch(window._routeApi + 'auth/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    }
                })
            }
        } finally {
            console.log('Cerrando sesión')
        }
        localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
        setUser(null);
        // Limpiar el store de proyectos al cerrar sesión
        useProyectosStore.getState().reset();
    };

    const hasPermission = (permiso: PermisoSlug | PermisoSlug[]) => {
        if (!permiso) return true;

        // Bypass para Administradores
        const isAdmin = user?.roles?.some(r => r.name === SYSTEM_ROLES.ADMIN);
        if (isAdmin) return true;

        if (Array.isArray(permiso)) {
            return permiso.some(p => permissions.has(p));
        }
        return permissions.has(permiso);
    }

    const refreshPermissions = async () => {
        const token = localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN);
        if (!token) return;

        try {
            const res = await fetch(window._routeApi + 'auth/verify-token', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                }
            });
            const json = await res.json();
            if (json.user) {
                // Solo actualizar si hay cambios reales en permisos o proyectos
                const currentPerms = Array.from(permissions).sort().join(',');
                const nextPerms = (json.user.permisos || []).sort().join(',');
                
                const currentProys = JSON.stringify(useProyectosStore.getState().proyectos.map(p => p.id).sort());
                const nextProys = JSON.stringify((json.user.proyectos || []).map(p => p.id).sort());

                if (currentPerms !== nextPerms || currentProys !== nextProys || user?.email !== json.user.email) {
                    setUser(json.user);
                    if (json.user.permisos) {
                        setPermissions(new Set(json.user.permisos));
                    }
                    if (json.user.proyectos) {
                        useProyectosStore.getState().setProyectos(json.user.proyectos);
                    }
                }
            }
        } catch (error) {
            console.error('Error refreshing permissions:', error);
        }
    };

    const isAuthenticated = () => {
        // Verificar si el usuario está autenticado
        return !!user;
    };

    // const isForcedChangePassword = () => {
    //     // Verificar si el usuario debe cambiar la contraseña
    //     return user?.changePassword;
    // };


    // Configurar el cierre automático de sesión antes de que expire el token
    useEffect(() => {
        if (!user || !expiredIn) return;

        // Cerrar sesión 30 segundos antes de que expire el token
        const SAFETY_MARGIN_MS = 30 * 1000; // 30 segundos
        const timeoutDuration = Math.max(0, (expiredIn * 1000) - SAFETY_MARGIN_MS);

        const timeoutId = setTimeout(() => {
            message.warning('Tu sesión está por expirar. Cerrando sesión...');
            logout();
        }, timeoutDuration);

        return () => clearTimeout(timeoutId);
    }, [user, expiredIn]);

    useEffect(() => {

        window.addEventListener('logout', () => logout())

        const token = localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN);

        if (!token) return setLoading(false);

        try {
            fetch(window._routeApi + 'auth/verify-token', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                }
            })
                .then(async res => {
                    const json = await res.json()
                    if (res.status === 401 || json.message) {
                        localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
                    } else if (json.user) {
                        if (json.token) localStorage.setItem(LOCAL_STORAGE_KEYS.TOKEN, json.token)
                        if (json.user.changePassword) {
                            message.warning('Se ha forzado el cambio de contraseña')
                        } else {
                            login(json.user, json.expiresIn);
                        }
                    } else {
                        localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
                        console.log('Error al iniciar sesión', res, json)
                    }
                    setLoading(false);
                })
                .catch(() => {
                    // message.error('Error al iniciar sesión')
                    localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
                    setLoading(false);
                })
        } catch (error) {
            localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
            setLoading(false);
        }

    }, []);

    return (
        <AuthContext.Provider
            value={{ user, loading, setLoading, login, logout, isAuthenticated, hasPermission, refreshPermissions }}
        >
            {children}
        </AuthContext.Provider>
    );
};