import { getToken } from "./http"

type WsParams = Record<string, string>
// El payload es dinámico (texto plano como "close"/"reload" u objetos JSON),
// por eso se entrega como `any` a los suscriptores.
type MessageHandler = (data: any) => void

interface ManagedSocketOptions {
    /** Tiempo base de reconexión en ms (crece exponencialmente con jitter). */
    baseReconnectDelay?: number
    /** Tope máximo del intervalo de reconexión en ms. */
    maxReconnectDelay?: number
    /** Intervalo del heartbeat en ms (0 = desactivado). */
    heartbeatInterval?: number
    /** Margen para esperar el "pong" antes de considerar la conexión muerta. */
    heartbeatTimeout?: number
}

const DEFAULTS: Required<ManagedSocketOptions> = {
    baseReconnectDelay: 1000,
    maxReconnectDelay: 30000,
    heartbeatInterval: 25000,
    heartbeatTimeout: 10000,
}

const newWsid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)

export class ManagedSocket {
    private socket: WebSocket | null = null
    private readonly handlers = new Set<MessageHandler>()
    private readonly opts: Required<ManagedSocketOptions>
    /** Estable durante toda la vida del socket: identifica la sesión en el backend. */
    readonly wsid = newWsid()

    private closedManually = false
    private retries = 0
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null
    private pongTimer: ReturnType<typeof setTimeout> | null = null

    constructor(
        private readonly topic: string,
        private readonly params: WsParams,
        options: ManagedSocketOptions = {},
    ) {
        this.opts = { ...DEFAULTS, ...options }
        this.connect()
    }

    private connect() {
        const token = getToken()
        if (!token) {
            console.warn("[WS] No hay token disponible para la conexión")
            return
        }

        const query = new URLSearchParams({ ...this.params, token, wsid: this.wsid })
        const url = `${window._routeWs}${this.topic}?${query.toString()}`

        console.log(`[WS] Conectando a ${this.topic}...`)
        const socket = new WebSocket(url)
        this.socket = socket

        socket.onopen = () => {
            this.retries = 0
            this.startHeartbeat()
        }

        socket.onmessage = (event) => this.handleRawMessage(event.data)

        socket.onclose = () => {
            this.stopHeartbeat()
            if (socket === this.socket) this.scheduleReconnect()
        }

        socket.onerror = (err) => {
            console.error(`[WS] Error en ${this.topic}:`, err)
        }
    }

    private handleRawMessage(raw: unknown) {
        // El heartbeat se resuelve aquí y no se propaga a los suscriptores.
        if (raw === "pong") {
            if (this.pongTimer) clearTimeout(this.pongTimer)
            this.pongTimer = null
            return
        }

        let data: unknown = raw
        if (typeof raw === "string") {
            try {
                data = JSON.parse(raw)
            } catch {
                data = raw
            }
        }
        this.handlers.forEach((h) => { h(data) })
    }

    private scheduleReconnect() {
        if (this.closedManually || this.reconnectTimer) return

        // Backoff exponencial con jitter, acotado a maxReconnectDelay.
        const exp = Math.min(
            this.opts.baseReconnectDelay * 2 ** this.retries,
            this.opts.maxReconnectDelay,
        )
        const delay = exp / 2 + (exp / 2) * Math.random()
        this.retries++

        console.warn(`[WS] Conexión cerrada (${this.topic}). Reconectando en ${Math.round(delay)}ms...`)
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this.connect()
        }, delay)
    }

    private startHeartbeat() {
        if (this.opts.heartbeatInterval <= 0) return
        this.stopHeartbeat()
        this.heartbeatTimer = setInterval(() => {
            if (this.socket?.readyState !== WebSocket.OPEN) return
            this.socket.send("ping")
            // Si no llega "pong" a tiempo, la conexión está muerta: forzar reciclo.
            this.pongTimer = setTimeout(() => {
                console.warn(`[WS] Heartbeat sin respuesta (${this.topic}). Reciclando conexión...`)
                this.socket?.close()
            }, this.opts.heartbeatTimeout)
        }, this.opts.heartbeatInterval)
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        if (this.pongTimer) clearTimeout(this.pongTimer)
        this.heartbeatTimer = null
        this.pongTimer = null
    }

    onMessage(callback: MessageHandler): () => void {
        this.handlers.add(callback)
        return () => this.handlers.delete(callback)
    }

    send(data: unknown) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(typeof data === "string" ? data : JSON.stringify(data))
        } else {
            console.warn("[WS] Intento de envío en socket cerrado")
        }
    }

    close() {
        this.closedManually = true
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
        this.stopHeartbeat()
        this.handlers.clear()
        this.socket?.close()
        this.socket = null
    }
}

export const useSocket = (topic: string, params: WsParams = {}) =>
    new ManagedSocket(topic, params)
