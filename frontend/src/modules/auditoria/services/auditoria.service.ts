import { GET, Paginated } from "@src/core/http";
import type { CoberturaAuditoria, EventoAuditoria, FiltrosDisponibles } from "../types";

/*
    Servicio de la bitácora.

    SOLO hay lecturas, y no por recortar alcance: `auditoria.log` no admite
    UPDATE ni DELETE ni siquiera desde la base. Si algún día alguien echa en
    falta un `save`, la respuesta es que una bitácora no se corrige.

    Contrato de resultado del sistema (docs/practicas.md §4): un servicio nunca
    rechaza, devuelve un centinela y el llamador lo comprueba.
*/

export interface ListarAuditoriaParams {
    esquema?: string;
    entidad?: string;
    id_registro?: string;
    usuario_id?: number;
    id_caso?: string;
    operacion?: string;
    desde?: number;   // epoch en segundos
    hasta?: number;   // epoch en segundos
    buscar?: string;
    pagina?: number;
    limite?: number;
}

/** Centinela de la línea de tiempo: página vacía, no `null`. */
const LOG_VACIO: Paginated<EventoAuditoria> = { data: [], total: 0, page: 1, page_size: 50 };

export const auditoriaService = {
    /** Línea de tiempo filtrable y paginada. */
    listar: (params: ListarAuditoriaParams): Promise<Paginated<EventoAuditoria>> =>
        GET<Paginated<EventoAuditoria>>("auditoria/log", { params })
            .then((res) => (Array.isArray(res?.data) ? res : LOG_VACIO))
            .catch(() => LOG_VACIO),

    /** Valores que existen en la bitácora, para poblar los desplegables. */
    filtros: (): Promise<FiltrosDisponibles | null> =>
        GET<FiltrosDisponibles>("auditoria/filtros")
            .catch(() => null),

    /** Todo lo que le pasó a un registro concreto, del más reciente al más antiguo. */
    historialRegistro: (
        esquema: string,
        entidad: string,
        idRegistro: string,
        limite = 200,
    ): Promise<EventoAuditoria[]> =>
        GET<{ data: EventoAuditoria[] }>(
            `auditoria/registro/${esquema}/${entidad}/${idRegistro}`,
            { params: { limite } },
        )
            .then((res) => (Array.isArray(res?.data) ? res.data : []))
            .catch(() => []),

    /** Qué tablas tienen trigger de auditoría y cuáles no. */
    cobertura: (): Promise<CoberturaAuditoria[]> =>
        GET<{ data: CoberturaAuditoria[] }>("auditoria/cobertura")
            .then((res) => (Array.isArray(res?.data) ? res.data : []))
            .catch(() => []),
};
