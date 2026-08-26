// implementación de redis para permisos y sesiones en memoria

import { RedisClient } from 'bun'
import { configServer } from '@/config'
import { PermisoSlug } from './permisos.type';

export class UserStore {
    private client: RedisClient

    constructor() {
        this.client = this.createClient();
    }

    private createClient(): RedisClient {
        const client = new RedisClient(configServer.redis.url, {
            // Reconexión amplia: ante caídas de red al Redis remoto, seguir
            // reintentando en vez de rendirse y dejar el cliente muerto.
            autoReconnect: true,
            maxRetries: 1000,
            // Encolar comandos mientras se restablece la conexión (en lugar de
            // fallarlos): el await se resuelve al reconectar.
            enableOfflineQueue: true,
            connectionTimeout: 5000,
        });
        // Si la conexión se cierra, reintentar proactivamente para no quedar
        // en estado cerrado permanente.
        client.onclose = (error) => {
            console.error('[Redis] Conexión cerrada, reintentando...', (error as any)?.message ?? error);
            client.connect().catch(() => { });
        };
        return client;
    }

    private async exec<T>(operation: (client: RedisClient) => Promise<T>, retries = 3): Promise<T | null> {
        for (let i = 0; i < retries; i++) {
            try {
                return await operation(this.client);
            } catch (error) {
                console.error(`[Redis] Error en intento ${i + 1}:`, error);
                // Si el cliente quedó desconectado, revivirlo antes de reintentar.
                if (!this.client.connected) {
                    await this.client.connect().catch(() => { });
                }
                if (i === retries - 1) return null;
                // Pequeña espera antes de reintentar
                await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
            }
        }
        return null;
    }

    async setUserPermissions(userId: string, permissions: string[]) {
        const key = `user:${userId}:permissions`;
        await this.exec(async (c) => {
            await c.del(key);
            if (permissions && permissions.length > 0) {
                await c.sadd(key, ...permissions);
            }
        });
    }

    async getUserPermissions(userId: string): Promise<string[] | null> {
        return await this.exec(async (c) => {
            const data = await c.smembers(`user:${userId}:permissions`);
            return data || null;
        });
    }

    async hasPermission(userId: string, permission: PermisoSlug): Promise<boolean> {
        const key = `user:${userId}:permissions`;
        const result = await this.exec(async (c) => {
            return await c.sismember(key, permission);
        });
        return !!result;
    }

    // ── Sesiones ─────────────────────────────────────────────────────────────
    // Redis es solo la CACHÉ del estado de la sesión; la fuente de verdad es
    // core.user_sessions. Un fallo de Redis degrada a consulta en BD, nunca
    // cierra sesiones (ver core/session.ts).

    /** Marca la sesión como activa durante `ttlSeconds`. */
    async addSession(sessionId: string, userId: number | string, ttlSeconds: number) {
        await this.exec(async (c) => {
            await c.set(`session:${sessionId}`, String(userId), 'EX', ttlSeconds);
            await c.sadd(`user:${userId}:sessions`, sessionId);
            await c.expire(`user:${userId}:sessions`, ttlSeconds);
        });
    }

    /** `true` solo si Redis confirma la sesión; `false` obliga a verificar en BD. */
    async isSessionCached(sessionId: string): Promise<boolean> {
        const result = await this.exec(async (c) => {
            return await c.exists(`session:${sessionId}`);
        });
        return !!result;
    }

    async removeSession(sessionId: string, userId?: number | string) {
        await this.exec(async (c) => {
            await c.del(`session:${sessionId}`);
            if (userId !== undefined) {
                await c.srem(`user:${userId}:sessions`, sessionId);
            }
        });
    }

    async removeSessions(sessionIds: string[], userId?: number | string) {
        if (!sessionIds.length) return;
        await this.exec(async (c) => {
            for (const id of sessionIds) {
                await c.del(`session:${id}`);
                if (userId !== undefined) {
                    await c.srem(`user:${userId}:sessions`, id);
                }
            }
        });
    }

    /** Ids de sesión que Redis tiene registrados para el usuario. */
    async getUserSessions(userId: number | string): Promise<string[]> {
        const result = await this.exec(async (c) => {
            return await c.smembers(`user:${userId}:sessions`);
        });
        return result || [];
    }

    async testConnection(): Promise<void> {
        const result = await this.exec(async (c) => {
            return await c.ping();
        });
        if (result === 'PONG') {
            console.log('✅ Redis connection successful');
        } else {
            console.error('❌ Redis connection failed');
        }
    }

}

export const userStore = new UserStore();
