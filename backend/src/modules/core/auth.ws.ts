import { verifyToken } from "@core/jwt";
import { Elysia } from "elysia";
import { ElysiaWS } from "elysia/ws";

export const wsSesssion = new Map<string, { ws: ElysiaWS, user: { id: string | number, type: 'core' | 'client', client_id?: string | number } }>()

export function notifyUserClose(userId: string | number, userType: 'core' | 'client' = 'core') {
    for (const [wsid, session] of wsSesssion.entries()) {
        if (String(session.user?.id) === String(userId) && session.user?.type === userType) {
            try {
                session.ws.send('close')
                session.ws.terminate()
            } catch { }
            wsSesssion.delete(wsid)
        }
    }
}

export function notifyClientClose(clientId: string | number) {
    for (const [wsid, session] of wsSesssion.entries()) {
        if (session.user?.type === 'client' && String(session.user?.client_id) === String(clientId)) {
            try {
                session.ws.send('close')
                session.ws.terminate()
            } catch { }
            wsSesssion.delete(wsid)
        }
    }
}

export function notifyUserReload(userId: string | number, userType: 'core' | 'client' = 'core') {
    for (const [wsid, session] of wsSesssion.entries()) {
        if (String(session.user?.id) === String(userId) && session.user?.type === userType) {
            try {
                session.ws.send('reload')
            } catch { }
        }
    }
}

export function notifyUserJson(userId: string | number, data: unknown, userType: 'core' | 'client' = 'core') {
    for (const [wsid, session] of wsSesssion.entries()) {
        if (String(session.user?.id) === String(userId) && session.user?.type === userType) {
            try {
                session.ws.send(JSON.stringify(data))
            } catch { }
        }
    }
}

interface UserPayload {
    id: string | number;
    user_type?: 'core' | 'client';
    client_id?: string | number;
}

export const AuthWs = new Elysia()
    .ws('user-active', {
        open: async (ws) => {
            console.log('🔗 WebSocket connection open');

            const { token, wsid } = ws.data.query

            if (!token || !wsid) return ws.terminate()

            try {
                // Verificar token
                const user = await verifyToken(token)
                if (!user) {
                    return ws.terminate()
                }

                // Agregar socket al Map
                const payload = user as UserPayload;
                const userType = payload.user_type || 'core';
                wsSesssion.set(wsid, {
                    ws,
                    user: {
                        id: payload.id,
                        type: userType,
                        client_id: payload.client_id
                    }
                })

            } catch {
                ws.terminate()
            }
        },
        message: (ws, message) => {
            // Heartbeat: el cliente envía "ping" y respondemos "pong" para que
            // detecte conexiones muertas (half-open) sin esperar el idleTimeout.
            if (message === 'ping') ws.send('pong')
        },
        close: (ws) => {
            // console.log('🔗 WebSocket connection closed')
            const { wsid } = ws.data.query
            // Eliminar socket del Map
            wsSesssion.delete(wsid)
        }
    })
