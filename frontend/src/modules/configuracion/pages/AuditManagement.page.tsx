import {
  ArrowRightOutlined,
  EyeOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { DataTable } from "@src/components/DataTable";
import {
  FilterContainer,
  FilterDateRange,
  FilterSelect,
} from "@src/components/ui/StandardFilters";
import { StandardPageLayout } from "@src/components/ui/StandardPageLayout";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Grid,
  Input,
  Modal,
  Pagination,
  Row,
  Space,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import dayjs from "dayjs";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { AuditFilters, AuditLog, auditService } from "../services/audit.service";
import { rolesService } from "../services/roles.service";

const { useBreakpoint } = Grid;
const { Text } = Typography;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de presentación — todo se DERIVA del propio log; nada hardcodeado.
// ─────────────────────────────────────────────────────────────────────────────

/** `nota_credito` → `Nota Credito`, `TRANSPORTE` → `Transporte`. */
const titleCase = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

// Paleta AntD asignada de forma determinista por módulo (mismo módulo → mismo color).
const TAG_PALETTE = [
  "blue", "green", "orange", "purple", "cyan",
  "geekblue", "magenta", "volcano", "gold", "lime", "red",
];
const moduleColor = (module: string): string => {
  let hash = 0;
  for (let i = 0; i < (module || "").length; i++) {
    hash = (hash + module.charCodeAt(i)) % TAG_PALETTE.length;
  }
  return TAG_PALETTE[hash];
};

/** Sección visible derivada del log: `Módulo › Tabla`. */
const getSectionDisplay = (log: { module?: string; table_name?: string }) => {
  const mod = log.module ? titleCase(log.module) : "";
  const tableSeg = (log.table_name || "").split(".").pop() || "";
  const table = titleCase(tableSeg);
  const text = [mod, table].filter(Boolean).join(" › ") || "—";
  return { text, color: moduleColor(log.module || "") };
};

const ACTION_CONFIG: Record<string, { color: string; label: string }> = {
  INSERT: { color: "success", label: "Creación" },
  UPDATE: { color: "processing", label: "Edición" },
  DELETE: { color: "error", label: "Eliminación" },
};

const ACTION_OPTIONS = [
  { label: "Creación", value: "INSERT" },
  { label: "Edición", value: "UPDATE" },
  { label: "Eliminación", value: "DELETE" },
];

// Etiquetas para campos comunes; lo no listado se humaniza automáticamente.
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  nombre: "Nombre",
  first_name: "Nombre",
  last_name: "Apellido",
  full_name: "Nombre completo",
  business_name: "Razón social",
  email: "Correo electrónico",
  phone: "Teléfono",
  address: "Dirección",
  description: "Descripción",
  descripcion: "Descripción",
  doc_type: "Tipo de documento",
  doc_number: "N° de documento",
  dni: "DNI",
  ruc: "RUC",
  plate: "Placa",
  brand: "Marca",
  capacity_kg: "Capacidad (kg)",
  license_number: "N° de licencia",
  unit: "Unidad",
  amount: "Monto",
  total: "Total",
  igv: "IGV",
  enable: "Habilitado",
  roles: "Roles",
  permissions: "Permisos",
};

// Campos técnicos/internos que no se muestran al usuario.
const HIDDEN_FIELDS = new Set([
  "id", "status", "user_cr", "user_up", "date_cr", "date_up",
  "created_at", "updated_at", "password", "password_hash",
  "ip_address", "registered_by", "updated_by", "created_by",
]);

// Campos que ocupan toda la fila en el detalle.
const LONG_FIELDS = new Set([
  "permissions", "roles", "description", "descripcion", "address", "notes", "notas",
]);

type Lookups = { roles: Record<number, string>; permissions: Record<number, string> };

const formatFieldValue = (
  key: string,
  value: any,
  lookups?: Lookups,
  token?: any,
): React.ReactNode => {
  if (value === null || value === undefined) return "—";
  if (value === true || value === "true") return <Tag color="success">Sí</Tag>;
  if (value === false || value === "false") return <Tag color="default">No</Tag>;

  // id de rol → nombre
  if ((key === "role_id" || key === "id_rol") && lookups?.roles?.[value]) {
    return <Tag color="red">{lookups.roles[value]}</Tag>;
  }

  // Listas de ids (permisos / roles) → nombres
  if ((key === "permissions" || key === "permisos" || key === "roles") && Array.isArray(value)) {
    const isRoles = key === "roles";
    const lookup = isRoles ? lookups?.roles : lookups?.permissions;
    if (value.length === 0) return <Text type="secondary" italic>Ninguno</Text>;
    return (
      <div
        style={{
          background: token?.colorFillAlter || "#fafafa",
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${token?.colorBorderSecondary || "#f0f0f0"}`,
          marginTop: 4,
          maxHeight: 200,
          overflowY: "auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <Space size={[0, 4]} wrap style={{ width: "100%" }}>
          {value.map((id: any) => (
            <Tag key={id} color={isRoles ? "volcano" : "cyan"} style={{ fontSize: 10, margin: "2px 0" }}>
              {lookup?.[id] || id}
            </Tag>
          ))}
        </Space>
      </div>
    );
  }

  // Montos en soles
  const lk = key.toLowerCase();
  if (lk.includes("amount") || lk.includes("monto") || lk === "igv" || lk === "total") {
    if (typeof value === "number") {
      return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
    }
  }

  // Fechas (epoch unix o ISO)
  if (lk.includes("date") || lk.includes("fecha")) {
    if (typeof value === "number") return dayjs.unix(value).format("DD/MM/YYYY");
    if (typeof value === "string") {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
  }

  // Arrays de primitivos
  if (Array.isArray(value) && value.every((v: any) => v == null || typeof v === "string" || typeof v === "number")) {
    if (value.length === 0) return <Text type="secondary" italic>Ninguno</Text>;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 240,
          overflowY: "auto",
          background: token?.colorFillAlter || "#fafafa",
          border: `1px solid ${token?.colorBorderSecondary || "#f0f0f0"}`,
          borderRadius: 6,
          padding: "6px 8px",
        }}
      >
        {value.map((v: any, i: number) => (
          <div key={i} style={{ fontSize: 12, padding: "2px 4px" }}>• {String(v ?? "—")}</div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Campos visibles de un payload de auditoría (aplana envoltorios comunes). */
const getVisibleFields = (
  data: any,
  lookups?: Lookups,
  token?: any,
): Array<{ key: string; label: string; value: React.ReactNode }> => {
  let processed = data;
  if (typeof data === "string" && data.trim().startsWith("{")) {
    try { processed = JSON.parse(data); } catch { processed = data; }
  }
  if (!processed || typeof processed !== "object") return [];

  // Desempaqueta { data: {...} }, { payload: {...} }, etc.
  const wrapKey = Object.keys(processed).find(
    (k) =>
      ["data", "json_data", "params", "body", "payload"].includes(k) &&
      processed[k] &&
      typeof processed[k] === "object",
  );
  if (wrapKey) {
    processed = { ...processed[wrapKey], ...processed };
    delete processed[wrapKey];
  }

  return Object.entries(processed)
    .filter(([key]) => !HIDDEN_FIELDS.has(key))
    .map(([key, value]) => ({
      key,
      label: FIELD_LABELS[key] || titleCase(key),
      value: formatFieldValue(key, value, lookups, token),
    }))
    .filter((f) => f.value !== "—" && f.value !== "" && f.value !== "{}");
};

/** Normaliza valores para comparar old vs new ignorando ruido (orden, formato). */
const normalize = (v: any): any => {
  if (v === null || v === undefined || v === "" || v === "—") return null;
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v.match(/^\d{4}-\d{2}-\d{2}/)) return v.substring(0, 10);
    if (!isNaN(v as any) && v.trim() !== "") return Number(v);
    return v.trim();
  }
  if (Array.isArray(v)) return JSON.stringify([...v].map(normalize).sort());
  if (typeof v === "object") {
    const sorted: Record<string, any> = {};
    Object.keys(v).sort().filter((k) => !HIDDEN_FIELDS.has(k)).forEach((k) => { sorted[k] = normalize(v[k]); });
    return JSON.stringify(sorted);
  }
  return String(v).trim();
};

export const AuditManagementPage = () => {
  const { token } = theme.useToken();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Lookups dinámicos (cargados desde la API, no hardcodeados).
  const [roleLookup, setRoleLookup] = useState<Record<number, string>>({});
  const [permissionLookup, setPermissionLookup] = useState<Record<number, string>>({});
  // Módulos descubiertos en los logs → poblan el filtro dinámicamente.
  const [knownModules, setKnownModules] = useState<string[]>([]);

  useEffect(() => {
    rolesService.getRoles().then((res) => {
      const data = res && "data" in res ? (res.data as any[]) : Array.isArray(res) ? res : [];
      setRoleLookup(data.reduce((acc, r: any) => ({ ...acc, [r.id]: r.name }), {}));
    });
    rolesService.getPermissions().then((res) => {
      const data = Array.isArray(res) ? res : [];
      setPermissionLookup(data.reduce((acc, p: any) => ({ ...acc, [p.id]: p.name }), {}));
    });
  }, []);

  const mergeKnownModules = useCallback((rows: AuditLog[]) => {
    if (!rows.length) return;
    setKnownModules((prev) => {
      const set = new Set(prev);
      rows.forEach((r) => r.module && set.add(r.module));
      return [...set].sort();
    });
  }, []);

  // Filtros
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(30, "day"),
    dayjs(),
  ]);
  const [moduleFilter, setModuleFilter] = useState<string | undefined>(undefined);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [tableSearch, setTableSearch] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Mobile: scroll infinito
  const [mobileLogs, setMobileLogs] = useState<AuditLog[]>([]);
  const [mobilePage, setMobilePage] = useState(1);
  const [mobileHasMore, setMobileHasMore] = useState(true);
  const [mobileLoading, setMobileLoading] = useState(false);

  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  const buildFilters = useCallback(
    (p: number, ps: number): AuditFilters => {
      const filters: AuditFilters = { page: p, page_size: ps };
      filters.date_from = (dateRange?.[0] ?? dayjs().subtract(30, "day")).startOf("day").unix();
      filters.date_to = (dateRange?.[1] ?? dayjs()).endOf("day").unix();
      if (moduleFilter) filters.module = moduleFilter;
      if (actionFilter) filters.action = actionFilter;
      if (tableSearch.trim()) filters.table_name = tableSearch.trim();
      return filters;
    },
    [dateRange, moduleFilter, actionFilter, tableSearch],
  );

  const fetchData = useCallback(() => {
    setLoading(true);
    auditService
      .getAuditLogs(buildFilters(page, pageSize))
      .then((res) => {
        setLogs(res.data || []);
        setTotal(res.total || 0);
        mergeKnownModules(res.data || []);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, buildFilters, mergeKnownModules]);

  const fetchMobileFirst = useCallback(() => {
    setMobileLoading(true);
    auditService
      .getAuditLogs(buildFilters(1, 20))
      .then((res) => {
        const data = res.data || [];
        setMobileLogs(data);
        setTotal(res.total || 0);
        setMobilePage(1);
        setMobileHasMore(data.length < (res.total || 0));
        mergeKnownModules(data);
      })
      .finally(() => setMobileLoading(false));
  }, [buildFilters, mergeKnownModules]);

  const fetchMobileNext = useCallback(() => {
    if (mobileLoading || !mobileHasMore) return;
    const nextPage = mobilePage + 1;
    setMobileLoading(true);
    auditService
      .getAuditLogs(buildFilters(nextPage, 20))
      .then((res) => {
        const data = res.data || [];
        setMobileLogs((prev) => {
          const updated = [...prev, ...data];
          setMobileHasMore(updated.length < (res.total || 0));
          return updated;
        });
        setMobilePage(nextPage);
        mergeKnownModules(data);
      })
      .finally(() => setMobileLoading(false));
  }, [mobilePage, mobileLoading, mobileHasMore, buildFilters, mergeKnownModules]);

  useEffect(() => {
    if (isMobile) fetchMobileFirst();
    else fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile ? null : fetchData, isMobile ? fetchMobileFirst : null]);

  const { containerRef, pullDistance, isRefreshing: isPulling } = usePullToRefresh({
    onRefresh: fetchMobileFirst,
    enabled: isMobile,
  });

  const handleResetFilters = () => {
    setDateRange([dayjs().subtract(30, "day"), dayjs()]);
    setModuleFilter(undefined);
    setActionFilter(undefined);
    setTableSearch("");
    setPage(1);
  };

  const moduleOptions = useMemo(
    () => knownModules.map((m) => ({ label: titleCase(m), value: m })),
    [knownModules],
  );

  const lookups = useMemo<Lookups>(
    () => ({ roles: roleLookup, permissions: permissionLookup }),
    [roleLookup, permissionLookup],
  );

  const columns = useMemo(
    () =>
      isMobile
        ? [
            {
              title: "Fecha / Hora",
              key: "date_cr",
              render: (_: any, record: AuditLog) => {
                const { text, color } = getSectionDisplay(record);
                const actionCfg = ACTION_CONFIG[record.action] || { color: "default", label: record.action };
                return (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <Text strong style={{ fontSize: token.fontSizeSM }}>{record.user_name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>{record.user_email}</Text>
                      <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <Tag color={color}>{text}</Tag>
                        <Tag color={actionCfg.color}>{actionCfg.label}</Tag>
                      </div>
                      <Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: "block" }}>
                        {record.date_cr ? dayjs.unix(record.date_cr).format("DD/MM/YYYY HH:mm") : "—"}
                      </Text>
                    </div>
                    <Tooltip title="Ver detalles">
                      <Button
                        type="text"
                        size="large"
                        icon={<EyeOutlined />}
                        style={{ color: token.colorPrimary }}
                        onClick={() => setDetailLog(record)}
                      />
                    </Tooltip>
                  </div>
                );
              },
            },
          ]
        : [
            {
              title: "Fecha / Hora",
              key: "date_cr",
              width: 160,
              render: (_: any, record: AuditLog) => (
                <Text style={{ fontSize: token.fontSizeSM }}>
                  {record.date_cr ? dayjs.unix(record.date_cr).format("DD/MM/YYYY HH:mm") : "—"}
                </Text>
              ),
            },
            {
              title: "Usuario",
              key: "user_name",
              width: 200,
              render: (_: any, record: AuditLog) => (
                <div>
                  <Text strong style={{ fontSize: token.fontSizeSM }}>{record.user_name}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>{record.user_email}</Text>
                </div>
              ),
            },
            {
              title: "Sección",
              key: "section",
              width: 220,
              render: (_: any, record: AuditLog) => {
                const { text, color } = getSectionDisplay(record);
                return <Tag color={color}>{text}</Tag>;
              },
            },
            {
              title: "Acción",
              dataIndex: "action",
              key: "action",
              width: 120,
              render: (action: string) => {
                const config = ACTION_CONFIG[action] || { color: "default", label: action };
                return <Tag color={config.color}>{config.label}</Tag>;
              },
            },
            {
              title: "",
              key: "details",
              align: "center" as const,
              width: 60,
              render: (_: any, record: AuditLog) => (
                <Tooltip title="Ver detalles">
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    style={{ color: token.colorPrimary }}
                    onClick={() => setDetailLog(record)}
                  />
                </Tooltip>
              ),
            },
          ],
    [token, isMobile],
  );

  const detailFields = useMemo(
    () => (detailLog ? getVisibleFields(detailLog.new_data || {}, lookups, token) : []),
    [detailLog, lookups, token],
  );
  const oldDetailFields = useMemo(
    () => (detailLog && detailLog.action !== "INSERT" ? getVisibleFields(detailLog.old_data || {}, lookups, token) : []),
    [detailLog, lookups, token],
  );

  const changedKeys = useMemo(() => {
    if (!detailLog || detailLog.action !== "UPDATE") return [];
    const rawOld = detailLog.old_data || {};
    const rawNew = detailLog.new_data || {};
    const keys = Array.from(new Set([...Object.keys(rawOld), ...Object.keys(rawNew)])).filter(
      (k) => !HIDDEN_FIELDS.has(k),
    );
    return keys.filter((k) => normalize(rawOld[k]) !== normalize(rawNew[k]));
  }, [detailLog]);

  const detailContent = detailLog && (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card size="small" styles={{ body: { padding: "12px 16px" } }} style={{ background: token.colorFillAlter, border: "none" }}>
        <Descriptions column={isMobile ? 1 : 2} size="small" layout="horizontal">
          <Descriptions.Item label={<Text type="secondary">Realizado por</Text>} span={isMobile ? 1 : 2}>
            <Text strong>{detailLog.user_name}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<Text type="secondary">Módulo</Text>}>
            {titleCase(detailLog.module || "") || "—"}
          </Descriptions.Item>
          <Descriptions.Item label={<Text type="secondary">ID Registro</Text>}>
            <Tag style={{ margin: 0 }}>#{detailLog.record_id}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={<Text type="secondary">Fecha y Hora</Text>} span={isMobile ? 1 : 2}>
            {dayjs.unix(detailLog.date_cr).format("DD/MM/YYYY HH:mm:ss")}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* CREACIÓN o ELIMINACIÓN */}
      {(detailLog.action === "INSERT" || detailLog.action === "DELETE") &&
        (detailFields.length > 0 || oldDetailFields.length > 0) && (
          <div>
            <Text type="secondary" strong style={{ display: "block", marginBottom: 12, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {detailLog.action === "INSERT" ? "Datos del registro creado" : "Datos del registro eliminado"}
            </Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: "16px 24px",
                background: "#fff",
                padding: 16,
                borderRadius: 8,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              {(detailLog.action === "INSERT" ? detailFields : oldDetailFields.length > 0 ? oldDetailFields : detailFields).map((field) => (
                <div
                  key={field.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gridColumn: !isMobile && LONG_FIELDS.has(field.key) ? "1 / span 2" : "auto",
                    minWidth: 0,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 11, marginBottom: 2 }}>{field.label}</Text>
                  <div style={{ fontSize: 13, wordBreak: "break-word" }}>{field.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* EDICIÓN */}
      {detailLog.action === "UPDATE" && (
        <div>
          <Text type="secondary" strong style={{ display: "block", marginBottom: 12, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Cambios realizados
          </Text>
          {changedKeys.length === 0 ? (
            <Empty description="No se detectaron cambios en los campos visibles" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {changedKeys.map((key) => {
                const label = FIELD_LABELS[key] || titleCase(key);
                const formattedOld = formatFieldValue(key, (detailLog.old_data || {})[key], lookups, token);
                const formattedNew = formatFieldValue(key, (detailLog.new_data || {})[key], lookups, token);
                return (
                  <div key={key} style={{ padding: "12px 16px", background: "#fff", border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 12, display: "block", marginBottom: 8, color: token.colorPrimary }}>{label}</Text>
                    <Row gutter={[12, 12]} align="middle">
                      <Col xs={24} md={11}>
                        <div style={{ padding: 8, background: "#fff1f0", borderRadius: 4, minHeight: 40, display: "flex", alignItems: "center", width: "100%", minWidth: 0 }}>
                          <div style={{ fontSize: 13, textDecoration: "line-through", color: token.colorError, wordBreak: "break-word", width: "100%", minWidth: 0 }}>
                            {formattedOld}
                          </div>
                        </div>
                      </Col>
                      {isMobile ? (
                        <Col span={24} style={{ textAlign: "center", margin: "-8px 0" }}>
                          <div style={{ color: token.colorTextDescription, fontSize: 12 }}>↓</div>
                        </Col>
                      ) : (
                        <Col span={2} style={{ textAlign: "center" }}>
                          <ArrowRightOutlined style={{ color: token.colorTextDescription }} />
                        </Col>
                      )}
                      <Col xs={24} md={11}>
                        <div style={{ padding: 8, background: "#f6ffed", borderRadius: 4, minHeight: 40, display: "flex", alignItems: "center", width: "100%", minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: token.colorSuccess, wordBreak: "break-word", width: "100%", minWidth: 0 }}>
                            {formattedNew}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SIN DATOS */}
      {(detailLog.action === "INSERT" || detailLog.action === "DELETE") &&
        detailFields.length === 0 &&
        oldDetailFields.length === 0 && (
          <Empty description="No hay datos adicionales para este registro" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
    </div>
  );

  const detailTitle = detailLog
    ? (() => {
        const actionCfg = ACTION_CONFIG[detailLog.action];
        const section = getSectionDisplay(detailLog);
        return (
          <Space size="small" wrap>
            <Tag color={actionCfg?.color}>{actionCfg?.label || detailLog.action}</Tag>
            <Text>en</Text>
            <Tag color={section.color}>{section.text}</Tag>
          </Space>
        );
      })()
    : "Detalle";

  const filtersNode = (
    <FilterContainer>
      <FilterDateRange
        label="Rango de Fechas"
        value={dateRange}
        onChange={(dates: any) => {
          setDateRange(dates);
          setPage(1);
        }}
        allowClear={false}
      />
      <FilterSelect
        label="Módulo"
        options={moduleOptions}
        value={moduleFilter}
        showSearch
        optionFilterProp="label"
        onChange={(v) => {
          setModuleFilter(v as string);
          setPage(1);
        }}
      />
      <FilterSelect
        label="Acción"
        options={ACTION_OPTIONS}
        value={actionFilter}
        onChange={(v) => {
          setActionFilter(v as string);
          setPage(1);
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Tabla / Registro</Text>
        <Input
          placeholder="Buscar por tabla..."
          prefix={<SearchOutlined />}
          value={tableSearch}
          allowClear
          onChange={(e) => {
            setTableSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
    </FilterContainer>
  );

  return (
    <div ref={containerRef} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {isMobile && (pullDistance > 0 || isPulling) && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: pullDistance || 40,
            overflow: "hidden",
            transition: pullDistance === 0 ? "height 0.2s ease" : undefined,
            color: token.colorPrimary,
            fontSize: 13,
            gap: 8,
          }}
        >
          {isPulling ? <LoadingOutlined spin /> : <ReloadOutlined />}
          {isPulling ? "Actualizando..." : pullDistance >= 80 ? "Soltar para actualizar" : "Desliza hacia abajo"}
        </div>
      )}

      <StandardPageLayout
        title="Registro de Auditoría"
        subtitle="Historial de operaciones realizadas en el sistema"
        icon={<FileSearchOutlined />}
        totalCount={total}
        onRefresh={() => fetchData()}
        filters={filtersNode}
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        onClearFilters={handleResetFilters}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <DataTable
            columns={columns}
            dataSource={isMobile ? mobileLogs : logs}
            rowKey="id"
            loading={isMobile ? mobileLoading && mobileLogs.length === 0 : loading}
            pagination={false}
            scroll={isMobile ? undefined : { x: 800 }}
            scrollHeight="calc(100vh - 430px)"
            onLoadMore={isMobile && mobileHasMore && !mobileLoading ? fetchMobileNext : undefined}
            loadingMore={isMobile && mobileLoading && mobileLogs.length > 0}
            mobileTotal={isMobile ? total : undefined}
            onRow={() => ({
              style: {
                contentVisibility: "auto",
                containIntrinsicSize: "0 90px",
                cursor: "pointer",
              } as React.CSSProperties,
            })}
          />

          {!isMobile && total > 0 && (
            <div style={{ padding: "12px 0 0 0", display: "flex", justifyContent: "flex-end", alignItems: "center", flexShrink: 0 }}>
              <Pagination
                size="small"
                current={page}
                pageSize={pageSize}
                total={total}
                onChange={(p, ps) => {
                  setPage(p);
                  setPageSize(ps);
                }}
                showSizeChanger
                showTotal={(t) => `Total: ${t} registros`}
              />
            </div>
          )}
        </div>
      </StandardPageLayout>

      <Modal
        title={detailTitle}
        open={!!detailLog}
        onCancel={() => setDetailLog(null)}
        footer={null}
        width={isMobile ? "100%" : 700}
        centered={!isMobile}
        styles={{ body: { maxHeight: "75vh", overflowY: "auto", padding: "12px 24px 24px 24px" } }}
        style={isMobile ? { top: 20 } : undefined}
      >
        <div style={{ padding: "4px 0" }}>{detailContent}</div>
      </Modal>
    </div>
  );
};
