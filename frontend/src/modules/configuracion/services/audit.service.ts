import { GET } from '@src/core/http';

// core.enum_module — sincronizar con postgres/core/core-tables.sql al agregar módulos.
export type AuditModule =
    | 'CORE'
    | 'ADMIN';

// core.enum_audit_action
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export interface AuditLog {
    id: number;
    user_id: number;
    user_name: string;
    user_email: string;
    module: AuditModule;
    table_name: string;
    record_id: number;
    action: AuditAction;
    old_data: any;
    new_data: any;
    ip_address: string;
    date_cr: number;
}

export interface AuditLogsResponse {
    data: AuditLog[];
    total: number;
    page: number;
    page_size: number;
}

export interface AuditFilters {
    page?: number;
    page_size?: number;
    date_from?: number;
    date_to?: number;
    user_id?: number;
    module?: string;
    action?: string;
    table_name?: string;
}

const path = 'audit-logs';

export const auditService = {
    getAuditLogs: (filters: AuditFilters): Promise<AuditLogsResponse> =>
        GET<any>(path, { params: filters })
            .then(res => res as AuditLogsResponse)
            .catch(error => {
                console.error('Error in auditService.getAuditLogs:', error);
                return { data: [], total: 0, page: 1, page_size: 20 };
            }),
};
