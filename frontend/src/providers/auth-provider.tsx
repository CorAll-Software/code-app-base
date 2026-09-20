import type { UserSession } from '@src/core/types';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useFeedback } from './message.provider';
import { type PermisoSlug, SYSTEM_ROLES } from '@src/core/permissions.constants';
import { LOCAL_STORAGE_KEYS } from '@src/core/constants';
import { POST, SESSION_REFRESHED_EVENT, clearSession, getRefreshToken, refreshSession } from '@src/core/http';
import { identificarUsuario } from '@src/core/sentry';

export interface IAuthContext {
    user: UserSession | null;
    /** Segundos de vida del access token vigente (para la renovación proactiva). */
    expiredIn: number;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    login: (userData: any, expiredIn: number) => void;
    logout: () => void;
    isAuthenticated: () => boolean;
    hasPermission: (permiso: PermisoSlug | PermisoSlug[]) => boolean;
    refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext(null);

export const useAuth = (): IAuthContext => useContext(AuthContext);

/** Margen antes del vencimiento con el que se renueva el access token. */
const REFRESH_MARGIN_SECONDS = 60;

export const AuthProvider = ({ children }) => {

    const [user, setUser] = useState<UserSession | null>(null);
    const [permissions, setPermissions] = useState<Set<string>>(new Set());
    const [expiredIn, setExpiredIn] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const { message } = useFeedback();
    // `logout` se usa dentro de efectos que no deben re-suscribirse en cada
    // render; la ref mantiene siempre la versión vigente.
    const logoutRef = useRef<() => void>(() => { });

    const applySession = (userData: any) => {
        setUser(userData);
        if (userData?.permisos) {
            setPermissions(new Set(userData.permisos));
        }
        // Un stack sin saber a quién le pasó cuesta el doble de rastrear.
        identificarUsuario(userData);
    };

    const login = (userData, expiredIn) => {
        applySession(userData);
        setExpiredIn(expiredIn);
    };

    const logout = () => {
        try {
            const token = localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN);
            const refreshToken = getRefreshToken();
            if (token || refreshToken) {
                // fetch directo (y no core/http) para no reentrar en el ciclo
                // de renovación/logout desde el propio cierre de sesión. Se manda
                // también el refresh: si el access token ya venció, es lo único
                // con lo que el backend puede revocar la sesión.
                fetch(`${window._routeApi}auth/logout`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ refreshToken })
                })
            }
        } finally {
            console.log('Cerrando sesión')
        }
        clearSession();
        setUser(null);
        setPermissions(new Set());
        setExpiredIn(0);
        identificarUsuario(null);
    };

    logoutRef.current = logout;

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
        if (!localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN)) return;

        try {
            const json: any = await POST('auth/verify-token', { hideNotification: true });
            if (!json?.user) return;

            // Solo actualizar si hay cambios reales en permisos o identidad
            const currentPerms = Array.from(permissions).sort().join(',');
            const nextPerms = (json.user.permisos || []).sort().join(',');

            if (currentPerms !== nextPerms || user?.email !== json.user.email) {
                applySession(json.user);
            }
        } catch (error) {
            console.error('Error refreshing permissions:', error);
        }
    };

    const isAuthenticated = () => {
        // Verificar si el usuario está autenticado
        return !!user;
    };

    // El backend avisa cada renovación (la dispara core/http.ts ante un 401 o
    // el temporizador de abajo) con los datos frescos del usuario.
    useEffect(() => {
        const onRefreshed = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.user) applySession(detail.user);
            if (detail?.expiresIn) setExpiredIn(detail.expiresIn);
        };
        window.addEventListener(SESSION_REFRESHED_EVENT, onRefreshed);
        return () => window.removeEventListener(SESSION_REFRESHED_EVENT, onRefreshed);
    }, []);

    // Renovar el access token ANTES de que expire, para que el usuario no vea
    // ni un 401 intermedio. Si la renovación falla, la sesión terminó de verdad.
    useEffect(() => {
        if (!user || !expiredIn) return;

        const delay = Math.max(5, expiredIn - REFRESH_MARGIN_SECONDS) * 1000;

        const timeoutId = setTimeout(async () => {
            const ok = await refreshSession();
            if (!ok) {
                message.warning('Tu sesión expiró. Vuelve a iniciar sesión.');
                logoutRef.current();
            }
        }, delay);

        return () => clearTimeout(timeoutId);
    }, [user, expiredIn]);

    useEffect(() => {

        const onLogout = () => logoutRef.current();
        window.addEventListener('logout', onLogout)

        const bootstrap = async () => {
            // Sin access token pero con refresh: reponerlo antes de preguntar,
            // porque core/http.ts cierra sesión si sale a la red sin token.
            if (!localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN) && getRefreshToken()) {
                await refreshSession();
            }

            if (!localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN)) {
                setLoading(false);
                return;
            }

            // `POST` renueva y reintenta si el access token venció mientras la
            // pestaña estaba cerrada: recuperar la sesión tras un F5 funciona
            // aunque el token ya no sirva.
            try {
                const json = await POST<any>('auth/verify-token', { hideNotification: true });
                if (json?.user) {
                    if (json.user.changePassword) {
                        message.warning('Se ha forzado el cambio de contraseña')
                    } else {
                        login(json.user, json.expiresIn);
                    }
                } else {
                    clearSession();
                }
            } catch {
                clearSession();
            } finally {
                setLoading(false);
            }
        };

        bootstrap();

        return () => window.removeEventListener('logout', onLogout);

    }, []);

    return (
        <AuthContext.Provider
            value={{ user, loading, setLoading, login, logout, isAuthenticated, hasPermission, refreshPermissions }}
        >
            {children}
        </AuthContext.Provider>
    );
};
