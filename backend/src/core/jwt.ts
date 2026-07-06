import jwt, { JwtPayload } from 'jsonwebtoken';
import { configServer } from '../config';
import { userStore } from './store';


const { expiresIn, secret } = configServer.auth;

export const generateToken = (payload: any) => {
    return jwt.sign(payload, secret, { expiresIn, algorithm: 'HS256' });
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

export const validateToken = async (headers: any, cookie?: any) => {
    const token = extractToken(headers, cookie);
    if (!token) {
        return { error: 'No se ha enviado el token', status: 401 }
    }
    try {
        const res = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload

        const isValid = await userStore.isTokenValid(token)
        if (!isValid) {
            return { error: 'Token inválido o expirado', status: 401 }
        }

        const roles = res.roles as any[];
        res.isAdmin = roles?.some(r => r.name === 'Administrador' || r.id === 1) ?? false;

        return res
    } catch (error) {
        // console.error('Error al verificar token:', error);
        return { error: 'Token inválido', status: 401 }
    }
}