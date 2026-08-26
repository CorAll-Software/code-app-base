import { emailService } from "@core/email/email-service"
import { userStore } from "@core/store"
import { execProcedure } from "@core/db/connection"
import { configServer } from "@/config"
// import { wsService } from "@core/redis"

/**
 * Tareas de arranque del servidor.
 *
 * Aquí se registran las conexiones iniciales (Redis, email) y los jobs
 * programados (cron-like vía setInterval). Ejemplo de job:
 *
 *   const runMiJob = async () => {
 *       const { result, error } = await execProcedure('esquema.mi_procedimiento', [{}])
 *       if (error) return console.error('[JOB] mi_job:', error)
 *       // ...
 *   }
 *   runMiJob()
 *   setInterval(runMiJob, 60 * 60 * 1000) // cada hora
 */

/**
 * Purga las sesiones ya cerradas o vencidas hace más de
 * `SESSION_RETENTION_DAYS` días. core.user_sessions crece con cada login, así
 * que sin esto la tabla nunca deja de crecer.
 */
const purgeSessions = async () => {
    const { result, error } = await execProcedure('core.purge_user_sessions', [
        { days: configServer.auth.sessionRetentionDays }
    ])
    if (error) return console.error('[JOB] purge_user_sessions:', error)
    if (result?.deleted) console.log(`[JOB] purge_user_sessions: ${result.deleted} sesiones eliminadas`)
}

export const mainServer = async () => {
    // Verificación de conexiones de infraestructura
    userStore.testConnection()
    emailService.testConnection()

    // Mantenimiento de sesiones (al arrancar y luego cada 24 h)
    purgeSessions()
    setInterval(purgeSessions, 24 * 60 * 60 * 1000)
}
