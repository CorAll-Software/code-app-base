import { RedisClient } from 'bun'
import { configServer } from '@/config'
import { randomUUID } from 'node:crypto'

/*
    Servicio para manejar la comunicación con Redis, incluyendo publicación y suscripción a canales.
    Este servicio sirve para manejar websockets distribuidos entre múltiples instancias del servidor a través de Redis Pub/Sub.
*/

/** Firma con la que se invocan los handlers de tema: `callback(userId, payload)`. */
type TopicCallback = (userId: string, payload: any) => void;

class RedisWebSocketService {

    private client: RedisClient;
    private subscriberClient: RedisClient;
    private topicHandlers: Map<string, { userIds: Set<string>, callback: TopicCallback }> = new Map();
    private localChannelSubs: Array<{ prefix: string; callback: (channel: string, payload: any) => void }> = [];

    instanceId = process.env.INSTANCE_ID ?? randomUUID();

    constructor() {
        this.client = new RedisClient(configServer.redis.url);
        this.subscriberClient = new RedisClient(configServer.redis.url);
        console.log('Redis instantiated with ID:', this.instanceId);
    }

    private async publish(type: string, userId: string, message: any) {
        const handler = this.topicHandlers.get(type);
        if (!handler) return;
        if (handler.userIds.has(userId)) {
            handler.callback(userId, message);
        } else {
            const targetInstance = await this.client.get(`ws:user:${userId}`);
            if (!targetInstance) return console.warn(`No instance found for user: ${userId}`);
            console.log(`Publishing to Redis: ws:instance:${targetInstance}`, { userId, type, payload: message });
            this.client.publish(`ws:instance:${targetInstance}`, JSON.stringify({ userId, type, payload: message }));
        }
    }

    registerTopic(type: string, initialUsers: Set<string>, callback: TopicCallback) {
        this.topicHandlers.set(type, { userIds: initialUsers, callback });
        return ({
            unregister: () => { this.topicHandlers.delete(type) },
            addUser: (userId: string) => {
                this.client.set(`ws:user:${userId}`, this.instanceId);
                this.client.expire(`ws:user:${userId}`, configServer.auth.refreshExpiresIn); // Expira con la sesión (refresh token)
                const handler = this.topicHandlers.get(type);
                if (handler) {
                    handler.userIds.add(userId);
                }
            },
            removeUser: (userId: string) => {
                this.client.del(`ws:user:${userId}`);
                const handler = this.topicHandlers.get(type);
                if (handler) {
                    handler.userIds.delete(userId);
                }
            },
            publish: (userId: string, message: any) => this.publish(type, userId, message)
        })
    }

    /**
     * Registra un suscriptor local (mismo proceso) para canales cuyo nombre
     * comience con `channelPrefix`. Es llamado antes de que llegue el PUBLISH
     * a Redis, garantizando entrega en despliegues de instancia única sin
     * necesidad de un round-trip Redis SUBSCRIBE.
     */
    subscribeLocal(channelPrefix: string, callback: (channel: string, payload: any) => void): void {
        this.localChannelSubs.push({ prefix: channelPrefix, callback })
    }

    /**
     * Publica un payload en un canal Redis arbitrario (best-effort).
     * Primero notifica suscriptores locales (mismo proceso, sin latencia),
     * luego publica en Redis para instancias remotas.
     * No lanza excepciones: si Redis no está disponible, el evento se pierde sin
     * afectar la operación principal.
     */
    publishToChannel(channel: string, payload: object): void {
        // Notificar suscriptores en-proceso primero (instancia única sin round-trip Redis)
        for (const sub of this.localChannelSubs) {
            if (channel.startsWith(sub.prefix)) {
                try { sub.callback(channel, payload) } catch { }
            }
        }
        // Publicar en Redis para enrutamiento multi-instancia (best-effort)
        this.client.publish(channel, JSON.stringify(payload)).catch((err: unknown) => {
            console.warn(`[Redis] PUBLISH ${channel} falló (best-effort):`, err)
        })
    }

    init() {
        this.subscriberClient.subscribe(`ws:instance:${this.instanceId}`, (message) => {
            try {
                const { userId, payload, type } = JSON.parse(message)
                const handler = this.topicHandlers.get(type);
                if (handler) {
                    handler.callback(userId, payload);
                } else {
                    console.warn(`No callback registered for type: ${type}`, userId, payload);
                }
            } catch (error) {
                console.error('Error al procesar mensaje Redis ws:', error);
            }
        })
    }

}

export const wsService = new RedisWebSocketService();