import jwt, { JwtPayload } from 'jsonwebtoken';
import { configServer } from '../config';
import { isSessionActive } from './session';

const { accessExpiresIn, secret } = configServer.auth;

/**
 * Claims del access token. `sid` es el id de la sesión (core.user_sessions.id):
 * identifica el dispositivo, permite revocarla y es el valor que se graba como
 * `token_cr`/`token_up` en cada registro que toca esta sesión.
 */
export interface AccessTokenClaims {
    id: number;
    email: string;
    names: string;
    telefono: string | null;
    roles: any[];
    sid: string;
}

export const generateAccessToken = (claims: AccessTokenClaims) => {
    return jwt.sign(claims, secret, { expiresIn: accessExpiresIn, algorithm: 'HS256' });
};

export const verifyToken = (token: string) => {
    try {
        return jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload
    } catch (error) {
    }
};

export const extractToken = (headers: any, cookie?: any): string | null => {

    const authorization = headers?.authorization as string | undefined;
    if (authorization && authorization.startsWith('Bearer ')) {
        return authorization.split(' ')[1];
    }
    if (cookie?.session_token?.value) {
        return cookie.session_token.value;
    }
    return null;
}

/**
 * El refresh token viaja en el body (`{ refreshToken }`) o en la cookie
 * httpOnly `refresh_token`. Nunca en la cabecera Authorization: esa es
 * exclusiva del access token.
 */
export const extractRefreshToken = (body: any, cookie?: any): string | null => {
    const fromBody = (body as any)?.refreshToken;
    if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
    if (cookie?.refresh_token?.value) return cookie.refresh_token.value;
    return null;
}

/**
 * Valida el access token de la petición: firma vigente + sesión aún activa.
 * La sesión se comprueba contra Redis y, si ahí no está, contra la BD
 * (ver core/session.ts) — así una revocación surte efecto de inmediato.
 */
export const validateToken = async (headers: any, cookie?: any) => {
    const token = extractToken(headers, cookie);
    if (!token) {
        return { error: 'No se ha enviado el token', status: 401 }
    }
    try {
        const res = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload

        if (!res.sid || !(await isSessionActive(res.sid))) {
            return { error: 'La sesión fue cerrada. Vuelve a iniciar sesión.', status: 401 }
        }

        const roles = res.roles as any[];
        res.isAdmin = roles?.some(r => r.name === 'Administrador' || r.id === 1) ?? false;

        return res
    } catch (error) {
        // console.error('Error al verificar token:', error);
        return { error: 'Token inválido', status: 401 }
    }
}
