import { verifyToken } from "@core/jwt";
import { isSessionActive } from "@core/session";
import { Elysia } from "elysia";
import type { ElysiaWS } from "elysia/ws";

/**
 * Sockets abiertos, indexados por `wsid` (lo genera el cliente, ver
 * frontend/src/core/ws.ts). Cada entrada recuerda el usuario y la SESIÓN
 * (`sid`) del token con el que se conectó, para poder cerrar un dispositivo
 * concreto sin tocar los demás.
 */
export const wsSessions = new Map<string, { ws: ElysiaWS, user: { id: string | number, sid: string } }>()

function closeSocket(wsid: string, session: { ws: ElysiaWS }) {
    try {
        session.ws.send('close')
        session.ws.terminate()
    } catch { }
    wsSessions.delete(wsid)
}

/** Cierra TODOS los sockets del usuario (cambio de contraseña, baja, etc.). */
export function notifyUserClose(userId: string | number) {
    for (const [wsid, session] of wsSessions.entries()) {
        if (String(session.user?.id) === String(userId)) {
            closeSocket(wsid, session)
        }
    }
}

/** Cierra solo los sockets de una sesión concreta (pestaña "Sesiones"). */
export function notifySessionClose(sessionId: string) {
    for (const [wsid, session] of wsSessions.entries()) {
        if (session.user?.sid === sessionId) {
            closeSocket(wsid, session)
        }
    }
}

export function notifyUserReload(userId: string | number) {
    for (const session of wsSessions.values()) {
        if (String(session.user?.id) === String(userId)) {
            try {
                session.ws.send('reload')
            } catch { }
        }
    }
}

export function notifyUserJson(userId: string | number, data: unknown) {
    for (const session of wsSessions.values()) {
        if (String(session.user?.id) === String(userId)) {
            try {
                session.ws.send(JSON.stringify(data))
            } catch { }
        }
    }
}

export const AuthWs = new Elysia()
    .ws('user-active', {
        open: async (ws) => {
            console.log('🔗 WebSocket connection open');

            const { token, wsid } = ws.data.query

            if (!token || !wsid) return ws.terminate()

            try {
                // Verificar token y que la sesión siga viva
                const claims = await verifyToken(token)
                if (!claims?.sid || !(await isSessionActive(claims.sid))) {
                    return ws.terminate()
                }

                wsSessions.set(wsid, {
                    ws,
                    user: { id: claims.id, sid: claims.sid }
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
            wsSessions.delete(wsid)
        }
    })
