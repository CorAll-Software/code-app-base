import { HistoryOutlined, LoadingOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Drawer, Empty, Grid, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { auditoriaService } from "../services/auditoria.service";
import {
  type EventoAuditoria,
  OPERACIONES_MAP,
  etiquetaEntidad,
  formatearValor,
  humanizarCampo,
} from "../types";

const { Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;

interface Props {
  evento: EventoAuditoria | null;
  open: boolean;
  onClose: () => void;
}

/** Fila del diff, ya aplanada para la tabla. */
interface FilaCambio {
  campo: string;
  antes: unknown;
  despues: unknown;
}

/** Fila de un snapshot completo (alta o baja). */
interface FilaSnapshot {
  campo: string;
  valor: unknown;
}

const tagOperacion = (operacion: string) => {
  const meta = OPERACIONES_MAP.get(operacion);
  return <Tag color={meta?.color ?? "default"}>{meta?.label ?? operacion}</Tag>;
};

export const DetalleEventoDrawer = ({ evento, open, onClose }: Props) => {
  const screens = useBreakpoint();
  const isMobile = screens.md === false;

  const [historial, setHistorial] = useState<EventoAuditoria[] | null>(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  if (!evento) return null;

  // El diff solo existe en las modificaciones; en altas y bajas la información
  // está en el snapshot completo, que es lo que se enseña en su lugar.
  const cambios: FilaCambio[] = Object.entries(evento.campos ?? {}).map(([campo, valor]) => ({
    campo,
    antes: valor?.antes,
    despues: valor?.despues,
  }));

  const snapshot = evento.datos_despues ?? evento.datos_antes ?? null;
  const filasSnapshot: FilaSnapshot[] = Object.entries(snapshot ?? {}).map(([campo, valor]) => ({
    campo,
    valor,
  }));

  const verHistorial = async () => {
    if (!evento.id_registro) return;
    setCargandoHistorial(true);
    const data = await auditoriaService.historialRegistro(
      evento.esquema,
      evento.entidad,
      evento.id_registro,
    );
    setCargandoHistorial(false);
    // El servicio devuelve [] si falló (el toast de error ya salió): sin esta
    // comprobación la pantalla diría "este registro no tiene historial", que es
    // una afirmación distinta de "no se pudo consultar".
    if (!data.length) return;
    setHistorial(data);
  };

  const cerrar = () => {
    setHistorial(null);
    onClose();
  };

  return (
    <Drawer
      title={
        <Space size="small" wrap>
          {tagOperacion(evento.operacion)}
          <Text strong>{etiquetaEntidad(evento.entidad)}</Text>
          {evento.id_registro && <Text type="secondary">#{evento.id_registro}</Text>}
        </Space>
      }
      open={open}
      onClose={cerrar}
      width={isMobile ? "100%" : 680}
      destroyOnHidden
    >
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Fecha">
            {dayjs.unix(evento.fecha).format("DD/MM/YYYY HH:mm:ss")}
          </Descriptions.Item>
          <Descriptions.Item label="Autor">
            {evento.usuario || "Sistema"}
            {evento.email_usuario && (
              <Text type="secondary"> · {evento.email_usuario}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Rol">
            {/* El rol que tenía EN ESE MOMENTO: es lo que vale como evidencia. */}
            {evento.rol || <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Tabla">
            <Text code>{evento.esquema}.{evento.entidad}</Text>
          </Descriptions.Item>
          {evento.detalle && (
            <Descriptions.Item label="Detalle">{evento.detalle}</Descriptions.Item>
          )}
        </Descriptions>

        {/* ── Qué cambió ─────────────────────────────────────────────────── */}
        {cambios.length > 0 && (
          <div>
            <Paragraph strong style={{ marginBottom: 8 }}>
              Campos modificados ({cambios.length})
            </Paragraph>
            <Table<FilaCambio>
              size="small"
              rowKey="campo"
              dataSource={cambios}
              pagination={false}
              scroll={{ x: "max-content" }}
              columns={[
                {
                  title: "Campo",
                  dataIndex: "campo",
                  render: (campo: string) => <Text strong>{humanizarCampo(campo)}</Text>,
                },
                {
                  title: "Antes",
                  dataIndex: "antes",
                  render: (v: unknown) => (
                    <Text delete type="secondary">{formatearValor(v)}</Text>
                  ),
                },
                {
                  title: "Después",
                  dataIndex: "despues",
                  render: (v: unknown) => <Text>{formatearValor(v)}</Text>,
                },
              ]}
            />
            {cambios.some((c) => c.antes === "***" || c.despues === "***") && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 12 }}
                message="Hay campos enmascarados"
                description="La bitácora guarda QUE una contraseña o un token cambió, nunca su valor. Un log consultable con secretos dentro sería el problema que la auditoría existe para controlar."
              />
            )}
          </div>
        )}

        {/* ── Fila completa (altas y bajas) ──────────────────────────────── */}
        {cambios.length === 0 && filasSnapshot.length > 0 && (
          <div>
            <Paragraph strong style={{ marginBottom: 8 }}>
              {evento.datos_despues ? "Fila creada" : "Fila eliminada"}
            </Paragraph>
            <Table<FilaSnapshot>
              size="small"
              rowKey="campo"
              dataSource={filasSnapshot}
              pagination={false}
              scroll={{ x: "max-content" }}
              columns={[
                {
                  title: "Campo",
                  dataIndex: "campo",
                  render: (campo: string) => <Text strong>{humanizarCampo(campo)}</Text>,
                },
                {
                  title: "Valor",
                  dataIndex: "valor",
                  render: (v: unknown) => <Text>{formatearValor(v)}</Text>,
                },
              ]}
            />
          </div>
        )}

        {cambios.length === 0 && filasSnapshot.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Este evento no altera datos (consulta, descarga o intento de acceso)"
          />
        )}

        {/* ── Trazas de la petición ──────────────────────────────────────── */}
        <Descriptions column={1} size="small" bordered title="Origen de la acción">
          <Descriptions.Item label="IP">
            {evento.ip || <Text type="secondary">No registrada</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Navegador">
            {evento.user_agent || <Text type="secondary">No registrado</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Endpoint">
            {evento.endpoint ? <Text code>{evento.endpoint}</Text> : <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Sesión">
            {evento.sesion_id ? <Text code>{evento.sesion_id}</Text> : <Text type="secondary">—</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Transacción">
            {/* Todas las filas con el mismo txid son un solo cambio: guardar un
                usuario con sus roles toca dos tablas y deja varias filas. */}
            <Text code>{evento.txid ?? "—"}</Text>
          </Descriptions.Item>
        </Descriptions>

        {/* ── Historial completo del registro ────────────────────────────── */}
        {evento.id_registro && (
          <div>
            <Button
              icon={cargandoHistorial ? <LoadingOutlined /> : <HistoryOutlined />}
              onClick={verHistorial}
              disabled={cargandoHistorial}
              block
            >
              Ver todo el historial de este registro
            </Button>

            {historial && (
              <Table<EventoAuditoria>
                style={{ marginTop: 16 }}
                size="small"
                rowKey="id_log"
                dataSource={historial}
                pagination={{ pageSize: 10, size: "small" }}
                scroll={{ x: "max-content" }}
                columns={[
                  {
                    title: "Fecha",
                    dataIndex: "fecha",
                    render: (f: number) => dayjs.unix(f).format("DD/MM/YY HH:mm"),
                  },
                  {
                    title: "Operación",
                    dataIndex: "operacion",
                    render: (op: string) => tagOperacion(op),
                  },
                  { title: "Autor", dataIndex: "usuario", render: (u: string) => u || "Sistema" },
                  {
                    title: "Campos",
                    dataIndex: "detalle",
                    render: (d: string) => d || <Text type="secondary">—</Text>,
                  },
                ]}
              />
            )}
          </div>
        )}
      </Space>
    </Drawer>
  );
};
