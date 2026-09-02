import { DatabaseOutlined, FileSearchOutlined, WarningOutlined } from "@ant-design/icons";
import { DataTable } from "@src/components/DataTable";
import {
  FilterContainer,
  FilterDateRange,
  FilterSelect,
  checkHasActiveFilters,
} from "@src/components/ui/StandardFilters";
import { StandardPageLayout } from "@src/components/ui/StandardPageLayout";
import { Alert, Button, Grid, Modal, Space, Table, Tag, Typography } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DetalleEventoDrawer } from "../components/DetalleEventoDrawer";
import { auditoriaService } from "../services/auditoria.service";
import {
  CoberturaAuditoria,
  EventoAuditoria,
  FiltrosDisponibles,
  OPERACIONES_MAP,
  etiquetaEntidad,
} from "../types";

const { Text } = Typography;
const { useBreakpoint } = Grid;

const PAGE_SIZE = 50;

/*
    Visor de la bitácora.

    Todo lo que se muestra se DERIVA del propio log: las opciones de los filtros
    salen de `auditoria/filtros`, que las calcula sobre las filas existentes. No
    hay catálogos en duro, así que una entidad nueva aparece sola en cuanto
    registra su primer evento y ningún filtro puede quedar ofreciendo algo que
    no devuelve resultados.
*/

export const AuditoriaPage = () => {
  const screens = useBreakpoint();
  const isMobile = screens.md === false;

  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);

  const [filtrosDisponibles, setFiltrosDisponibles] = useState<FiltrosDisponibles | null>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  // Filtros aplicados
  const [buscar, setBuscar] = useState("");
  const [operacion, setOperacion] = useState<string | undefined>();
  const [entidad, setEntidad] = useState<string | undefined>();
  const [usuarioId, setUsuarioId] = useState<number | undefined>();
  const [rango, setRango] = useState<[Dayjs, Dayjs] | null>(null);

  const [eventoSel, setEventoSel] = useState<EventoAuditoria | null>(null);

  const [coberturaAbierta, setCoberturaAbierta] = useState(false);
  const [cobertura, setCobertura] = useState<CoberturaAuditoria[]>([]);
  const [cargandoCobertura, setCargandoCobertura] = useState(false);

  const cargar = useCallback(async (paginaSolicitada = pagina) => {
    setCargando(true);
    const res = await auditoriaService.listar({
      buscar: buscar || undefined,
      operacion,
      // El filtro de entidad viaja como `esquema.tabla` para no confundir dos
      // tablas homónimas de esquemas distintos.
      esquema: entidad?.split(".")[0],
      entidad: entidad?.split(".")[1],
      usuario_id: usuarioId,
      desde: rango?.[0] ? rango[0].startOf("day").unix() : undefined,
      hasta: rango?.[1] ? rango[1].endOf("day").unix() : undefined,
      pagina: paginaSolicitada,
      limite: PAGE_SIZE,
    });
    setCargando(false);
    setEventos(res.data);
    setTotal(res.total);
  }, [buscar, operacion, entidad, usuarioId, rango, pagina]);

  useEffect(() => { cargar(1); setPagina(1); }, [buscar, operacion, entidad, usuarioId, rango]);

  useEffect(() => {
    auditoriaService.filtros().then((res) => {
      // `null` = la consulta falló; el toast de error ya salió y los
      // desplegables se quedan como estaban en vez de vaciarse en silencio.
      if (res) setFiltrosDisponibles(res);
    });
  }, []);

  const abrirCobertura = async () => {
    setCoberturaAbierta(true);
    setCargandoCobertura(true);
    const data = await auditoriaService.cobertura();
    setCargandoCobertura(false);
    setCobertura(data);
  };

  const sinAuditar = useMemo(() => cobertura.filter((c) => !c.auditada), [cobertura]);

  const limpiarFiltros = () => {
    setOperacion(undefined);
    setEntidad(undefined);
    setUsuarioId(undefined);
    setRango(null);
  };

  const columnas = [
    {
      title: "Fecha",
      dataIndex: "fecha",
      width: 150,
      render: (f: number) => dayjs.unix(f).format("DD/MM/YYYY HH:mm:ss"),
    },
    {
      title: "Operación",
      dataIndex: "operacion",
      width: 140,
      render: (op: string) => {
        const meta = OPERACIONES_MAP.get(op);
        return <Tag color={meta?.color ?? "default"}>{meta?.label ?? op}</Tag>;
      },
    },
    {
      title: "Entidad",
      dataIndex: "entidad",
      width: 180,
      render: (ent: string, row: EventoAuditoria) => (
        <Space size={4}>
          <Text>{etiquetaEntidad(ent)}</Text>
          {row.id_registro && <Text type="secondary">#{row.id_registro}</Text>}
        </Space>
      ),
    },
    {
      title: "Autor",
      dataIndex: "usuario",
      width: 200,
      render: (u: string, row: EventoAuditoria) => (
        <Space orientation="vertical" size={0}>
          <Text>{u || "Sistema"}</Text>
          {row.rol && <Text type="secondary" style={{ fontSize: 12 }}>{row.rol}</Text>}
        </Space>
      ),
    },
    {
      title: "Qué cambió",
      dataIndex: "detalle",
      render: (d: string) => d || <Text type="secondary">—</Text>,
    },
    {
      title: "IP",
      dataIndex: "ip",
      width: 130,
      render: (ip: string) => ip || <Text type="secondary">—</Text>,
    },
  ];

  return (
    <>
      <StandardPageLayout
        title="Auditoría"
        icon={<FileSearchOutlined />}
        subtitle="Una fila por acción, inmutable. Registra quién hizo qué, cuándo y desde dónde."
        totalCount={total}
        searchValue={buscar}
        onSearchChange={setBuscar}
        searchPlaceholder="Buscar por detalle, endpoint, entidad o id..."
        onRefresh={() => cargar()}
        isFilterOpen={filtrosAbiertos}
        setIsFilterOpen={setFiltrosAbiertos}
        onClearFilters={limpiarFiltros}
        hasActiveFilters={checkHasActiveFilters(operacion, entidad, usuarioId, rango)}
        extraActions={
          <Button icon={<DatabaseOutlined />} onClick={abrirCobertura}>
            Cobertura
          </Button>
        }
        filters={
          <FilterContainer>
            <FilterDateRange
              label="Rango de fechas"
              value={rango}
              onChange={(v: [Dayjs, Dayjs] | null) => setRango(v)}
            />
            <FilterSelect
              label="Operación"
              value={operacion}
              onChange={setOperacion}
              options={(filtrosDisponibles?.operaciones ?? []).map((o) => ({
                value: o.operacion,
                label: `${OPERACIONES_MAP.get(o.operacion)?.label ?? o.operacion} (${o.eventos})`,
              }))}
            />
            <FilterSelect
              label="Entidad"
              value={entidad}
              onChange={setEntidad}
              options={(filtrosDisponibles?.entidades ?? []).map((e) => ({
                value: `${e.esquema}.${e.entidad}`,
                label: `${etiquetaEntidad(e.entidad)} (${e.eventos})`,
              }))}
            />
            <FilterSelect
              label="Usuario"
              value={usuarioId}
              onChange={setUsuarioId}
              showSearch
              optionFilterProp="label"
              options={(filtrosDisponibles?.usuarios ?? []).map((u) => ({
                value: u.usuario_id,
                label: `${u.usuario} (${u.eventos})`,
              }))}
            />
          </FilterContainer>
        }
      >
        <DataTable<EventoAuditoria>
          rowKey="id_log"
          loading={cargando}
          dataSource={eventos}
          columns={columnas}
          mobileTotal={total}
          onRow={(row) => ({ onClick: () => setEventoSel(row), style: { cursor: "pointer" } })}
          pagination={{
            current: pagina,
            pageSize: PAGE_SIZE,
            total,
            // Paginación de SERVIDOR: la bitácora crece sin techo y traerla
            // entera al navegador dejaría de funcionar el primer mes.
            showSizeChanger: false,
            onChange: (p: number) => { setPagina(p); cargar(p); },
          }}
        />
      </StandardPageLayout>

      <DetalleEventoDrawer
        evento={eventoSel}
        open={!!eventoSel}
        onClose={() => setEventoSel(null)}
      />

      <Modal
        title="Cobertura de la auditoría"
        open={coberturaAbierta}
        onCancel={() => setCoberturaAbierta(false)}
        footer={null}
        width={isMobile ? "100%" : 720}
      >
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          {/* Es la pregunta que la bitácora sola no puede responder: una tabla
              sin trigger NUNCA aparece en el log, y esa ausencia se lee igual
              que "no pasó nada". */}
          {sinAuditar.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message={`${sinAuditar.length} tabla(s) sin auditar`}
              description="Sus cambios no dejan rastro. Actívalas con auditoria.activar_esquema('<esquema>') salvo que estén excluidas a propósito (ver postgres/auditoria/README.md)."
            />
          ) : (
            cobertura.length > 0 && (
              <Alert type="success" showIcon message="Todas las tablas registradas tienen trigger de auditoría" />
            )
          )}

          <Table<CoberturaAuditoria>
            size="small"
            rowKey={(r) => `${r.esquema}.${r.tabla}`}
            loading={cargandoCobertura}
            dataSource={cobertura}
            pagination={false}
            scroll={{ y: 400, x: "max-content" }}
            columns={[
              { title: "Esquema", dataIndex: "esquema", width: 120 },
              { title: "Tabla", dataIndex: "tabla" },
              {
                title: "Auditada",
                dataIndex: "auditada",
                width: 110,
                render: (v: boolean) =>
                  v ? <Tag color="green">Sí</Tag> : <Tag color="red">No</Tag>,
              },
              { title: "Eventos", dataIndex: "eventos", width: 100 },
            ]}
          />
        </Space>
      </Modal>
    </>
  );
};

export default AuditoriaPage;
