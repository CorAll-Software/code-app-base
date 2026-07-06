import { execProcedure } from './db/connection';

type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'EXPORT'
// Sincronizar con core.enum_module (postgres/core/core-tables.sql) al agregar módulos.
type AuditModule = 'CORE' | 'ADMIN'

interface AuditParams {
    userId: number
    module: AuditModule
    tableName: string
    recordId?: number | null
    action: AuditAction
    oldData?: any
    newData?: any
    ipAddress?: string
}

/**
 * Registra una entrada en el log de auditoría.
 * Es fire-and-forget: no bloquea la respuesta del endpoint.
 */
export function logAudit(params: AuditParams): void {
    const payload = {
        user_id: params.userId,
        module: params.module,
        table_name: params.tableName,
        record_id: params.recordId ?? null,
        action: params.action,
        old_data: params.oldData ? JSON.stringify(params.oldData) : null,
        new_data: params.newData ? JSON.stringify(params.newData) : null,
        ip_address: params.ipAddress || 'unknown',
    }

    execProcedure('core.save_audit_log', [payload]).catch(err => {
        console.error('[AUDIT] Error al registrar auditoría:', err)
    })
}

/**
 * Determina la acción de auditoría basándose en los datos del body.
 * - Si no tiene id → INSERT
 * - Si tiene status === false → DELETE (soft delete)
 * - Si tiene id → UPDATE
 */
export function resolveAuditAction(bodyData: any): AuditAction {
    if (!bodyData?.id || bodyData.id === 0) return 'INSERT'
    if (bodyData.status === false) return 'DELETE'
    return 'UPDATE'
}

/**
 * Extrae la IP del cliente desde los headers del request.
 */
export function extractClientIp(headers: any): string {
    return headers?.['x-forwarded-for'] || headers?.['x-real-ip'] || 'unknown'
} 