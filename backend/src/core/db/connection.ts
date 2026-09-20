import { SQL } from 'bun'
import { configServer } from '../../config'
import { reportarError, sqlStateDe } from '../sentry'

// Ejecuta una función de pg usando Bun SQL nativo
export interface IPgResult { error?: any, result?: any }

/*
  Reporte de fallos de base de datos.

  Este es el punto donde hay que capturar, y no más arriba: `execProcedure`
  devuelve `{ error: string }`, así que en cuanto sale de aquí el objeto
  original —con su `code` de PostgreSQL— ya no existe. Sin el código no se
  puede distinguir un defecto de un mensaje de negocio.

  Y hace falta distinguirlo porque los endpoints convierten CUALQUIER error de
  aquí en un 400, no en un 500: una función SQL rota nunca llega al manejador
  global de `index.ts`. Si no se reportara aquí, no se reportaría en ningún
  sitio.

  `reportarError` descarta por su cuenta los P0001 (`RAISE EXCEPTION`, que es
  como las funciones del núcleo señalan "ya existe ese correo").
*/
const reportarErrorDeBd = (error: unknown, procedureName: string, intentos: number) => {
    const codigo = sqlStateDe(error) ?? (error as any)?.code
    reportarError(error, {
        transaccion: `DB ${procedureName}`,
        // Agrupado por función y código: un `save_user` roto es una incidencia
        // distinta de un `get_users` roto, aunque el mensaje se parezca.
        huella: ['db', procedureName, String(codigo ?? 'sin-codigo')],
        etiquetas: { capa: 'db', procedimiento: procedureName },
        extra: { intentos, detalle: (error as any)?.detail, pista: (error as any)?.hint },
    })
}

// Inicializa la conexión SQL de Bun con configuración
let sql: SQL

function getSqlInstance(): SQL {
    if (!sql) {
        // Construir la URL de conexión
        const connectionUrl = `postgresql://${configServer.db.user}:${configServer.db.password}@${configServer.db.host}:${configServer.db.port}/${configServer.db.database}`

        sql = new SQL(connectionUrl, {
            idleTimeout: 20,
            max: configServer.db.maxPoolSize || 10,
            connectionTimeout: 10,
            // onconnect: async (conn) => {
            //     console.log('[DB] Conexión establecida con la base de datos')
            // }
            // ssl: {
            //     rejectUnauthorized: false
            // },
        })
    }
    return sql
}

export async function execProcedure(
    procedureName: string,
    args: any[] | { [key: string]: any },
    { maxRetries }: { maxRetries: number } = { maxRetries: 3 }
): Promise<IPgResult> {

    const db = getSqlInstance()

    // Asegurar que args sea siempre un array
    let finalArgs: any[]
    if (!args) {
        finalArgs = []
    } else if (Array.isArray(args)) {
        finalArgs = args
    } else {
        finalArgs = [args]
    }

    // Construir los placeholders para los argumentos
    const placeholders = finalArgs.map((_, i) => `$${i + 1}`).join(', ')

    const startTime = Date.now()
    let lastError: any = null

    // Intentar ejecutar la consulta con reintentos
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const funcToExec = `SELECT * FROM ${procedureName}(${placeholders}) as output`
            const queryResult = await db.unsafe(funcToExec, finalArgs)
            const result = queryResult[0]?.output

            const elapsedTime = Date.now() - startTime
            if (attempt > 1) {
                console.log(`[DB] ${procedureName} - ${elapsedTime}ms (reintento ${attempt - 1} exitoso)`)
            } else {
                console.log(`[DB] ${procedureName} - ${elapsedTime}ms`)
            }

            return { result }

        } catch (error) {
            lastError = error
            const errorMsg = error instanceof Error ? error.message : String(error)

            // Verificar si es un error de timeout
            const isTimeout = errorMsg.toLowerCase().includes('timeout') ||
                errorMsg.toLowerCase().includes('timed out') ||
                errorMsg.toLowerCase().includes('connection timeout')

            if (isTimeout && attempt < maxRetries) {
                console.warn(`[DB] Timeout en ${procedureName} (intento ${attempt}/${maxRetries}), reintentando...`)
                // Esperar un poco antes de reintentar (100ms * número de intento)
                await new Promise(resolve => setTimeout(resolve, 100 * attempt))
                continue
            }

            // Si no es timeout o ya se agotaron los reintentos
            console.error(`[DB] Error en ${procedureName}:`, errorMsg)
            reportarErrorDeBd(error, procedureName, attempt)
            return { error: errorMsg }
        }
    }

    // Si llegamos aquí, se agotaron todos los reintentos
    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError)
    console.error(`[DB] Error en ${procedureName} después de ${maxRetries} intentos:`, errorMsg)
    return { error: errorMsg }
}

// Función para cerrar la conexión cuando sea necesario
export async function closeSqlConnection(timeout?: number): Promise<void> {
    if (sql) {
        try {
            await sql.close({ timeout: timeout ?? 5 })
        } catch (error) {
            console.error('[DB] Error al cerrar conexión:', error)
        }
    }
}

// Función para probar la conexión a la base de datos
export async function testDbConnection(): Promise<IPgResult> {
    const db = getSqlInstance()
    try {
        const queryResult = await db.unsafe(`SELECT 1 as result`)
        console.log('[DB] Conexión a la base de datos exitosa')
        return { result: queryResult[0]?.result }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('[DB] Error en testDbConnection:', errorMsg)
        return { error: errorMsg }
    }
}