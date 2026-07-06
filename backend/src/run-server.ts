import { emailService } from "@core/email/email-service"
import { userStore } from "@core/store"
// import { execProcedure } from "@core/db/connection"
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
export const mainServer = async () => {
    // Verificación de conexiones de infraestructura
    userStore.testConnection()
    emailService.testConnection()
}
