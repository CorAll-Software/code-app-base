// implementación de redis para permisos y sesiones en memoria

import { RedisClient } from 'bun'
import { configServer } from '@/config'
import type { PermisoSlug } from './permisos.type';

/**
 * Centinela que distingue "caché cebada, este usuario no tiene permisos" de
 * "caché fría". No puede colisionar con un slug real (`modulo.accion`).
 */
const PERMISSIONS_CACHED_MARKER = '__cached__';

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

    /**
     * Descarta el cliente actual y crea uno nuevo: el mismo efecto que reiniciar
     * el backend, sin tumbar el proceso. Se usa cuando el cliente queda "zombi"
     * (autoReconnect agotado o colgado) y deja de responder; sin esto, el login
     * no vuelve a funcionar hasta reiniciar el servicio.
     */
    private resetClient() {
        console.warn('[Redis] Recreando el cliente Redis');
        const old = this.client;
        old.onclose = null;
        try { old.close(); } catch { }
        this.client = this.createClient();
    }

    private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Timeout de ${ms}ms`)), ms);
            promise.then(
                (v) => { clearTimeout(timer); resolve(v); },
                (e) => { clearTimeout(timer); reject(e); }
            );
        });
    }

    /**
     * Health check: PING con timeout (con la offline queue activa, un PING sin
     * conexión esperaría para siempre). Si falla, recrea el cliente para que el
     * siguiente intento —o la siguiente petición— parta limpio.
     */
    async ping(timeoutMs = 2000): Promise<boolean> {
        try {
            const result = await this.withTimeout(this.client.ping(), timeoutMs);
            return result === 'PONG';
        } catch (error) {
            console.error('[Redis] Health check falló:', (error as any)?.message ?? error);
            this.resetClient();
            return false;
        }
    }

    private async exec<T>(operation: (client: RedisClient) => Promise<T>, retries = 3): Promise<T | null> {
        for (let i = 0; i < retries; i++) {
            try {
                // Timeout: con la offline queue, un comando sin conexión
                // quedaría esperando indefinidamente y colgaría la petición.
                return await this.withTimeout(operation(this.client), 5000);
            } catch (error) {
                console.error(`[Redis] Error en intento ${i + 1}:`, error);
                // Si el cliente quedó desconectado, revivirlo antes de reintentar.
                if (!this.client.connected) {
                    await this.client.connect().catch(() => { });
                }
                if (i === retries - 1) {
                    // Reintentos agotados: el cliente probablemente quedó
                    // inservible; se recrea para que la próxima petición funcione.
                    this.resetClient();
                    return null;
                }
                // Pequeña espera antes de reintentar
                await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
            }
        }
        return null;
    }

    // ── Permisos ─────────────────────────────────────────────────────────────
    // Igual que las sesiones, Redis es solo CACHÉ: la fuente de verdad es
    // core.get_user_permissions. Ver core/permissions.ts, que resuelve el
    // arranque en frío y la invalidación.

    /**
     * Deja en caché los permisos del usuario. Se marca con un miembro centinela
     * porque un usuario sin ningún permiso es un caso legítimo: sin él, un set
     * vacío (que en Redis equivale a no existir) se confundiría con caché fría
     * y provocaría una consulta a BD en cada petición.
     */
    async setUserPermissions(userId: number | string, permissions: string[]) {
        const key = `user:${userId}:permissions`;
        await this.exec(async (c) => {
            await c.del(key);
            await c.sadd(key, PERMISSIONS_CACHED_MARKER, ...(permissions || []));
            await c.expire(key, configServer.auth.refreshExpiresIn);
        });
    }

    /** `false` = caché fría (nunca cebada o expirada), hay que ir a BD. */
    async hasCachedPermissions(userId: number | string): Promise<boolean> {
        const result = await this.exec(async (c) => {
            return await c.sismember(`user:${userId}:permissions`, PERMISSIONS_CACHED_MARKER);
        });
        return !!result;
    }

    async hasPermission(userId: number | string, permission: PermisoSlug): Promise<boolean> {
        const key = `user:${userId}:permissions`;
        const result = await this.exec(async (c) => {
            return await c.sismember(key, permission);
        });
        return !!result;
    }

    /**
     * Descarta la caché del usuario. La siguiente petición la recarga desde BD,
     * así que invalidar de más solo cuesta una consulta.
     */
    async clearUserPermissions(userId: number | string) {
        await this.exec(async (c) => {
            await c.del(`user:${userId}:permissions`);
        });
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

    /**
     * Dueño de la sesión según Redis, o `null` si no está en caché (y entonces
     * hay que verificar en BD).
     */
    async getSessionUser(sessionId: string): Promise<string | null> {
        const result = await this.exec(async (c) => {
            return await c.get(`session:${sessionId}`);
        });
        return result ?? null;
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
