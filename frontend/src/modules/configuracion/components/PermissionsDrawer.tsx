import {
  Drawer,
  Table,
  Input,
  Typography,
  Space,
  Badge,
  Button,
  Tooltip,
  Empty,
  Tag,
  Grid,
} from "antd";
import {
  KeyOutlined,
  SearchOutlined,
  ExpandOutlined,
  CompressOutlined,
  TeamOutlined,
  DownOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useState, useMemo, useEffect } from "react";
import { Permission, rolesService, Role } from "../services/roles.service";
import {
  PermissionTreeNode,
  buildPermissionTree,
  collectGroupKeys,
  collectLeafKeys,
  filterPermissions,
} from "../services/modules.config";

const { Text } = Typography;

interface PermissionsDrawerProps {
  open: boolean;
  onClose: () => void;
  permissions: Permission[];
  loading?: boolean;
}

export const PermissionsDrawer = ({
  open,
  onClose,
  permissions,
  loading,
}: PermissionsDrawerProps) => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [searchText, setSearchText] = useState("");
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  // Cargar roles para mostrar dependencias
  useEffect(() => {
    if (open) {
      rolesService.getRoles({ page: 1, page_size: 1000 })
        .then(res => setRoles(res.data));
    }
  }, [open]);

  const groupedData = useMemo(
    () => buildPermissionTree(filterPermissions(permissions ?? [], searchText)),
    [permissions, searchText],
  );

  const allGroupKeys = useMemo(() => collectGroupKeys(groupedData), [groupedData]);

  const [hasExpandedInitially, setHasExpandedInitially] = useState(false);

  useEffect(() => {
    if (!open) {
      setHasExpandedInitially(false);
    }
  }, [open]);

  // Auto-expandir cuando se busca
  useEffect(() => {
    if (searchText.trim()) {
      setExpandedRowKeys(allGroupKeys);
    }
  }, [searchText, allGroupKeys]);

  // Inicialmente expandir todo
  useEffect(() => {
    if (open && !hasExpandedInitially && allGroupKeys.length > 0) {
      setExpandedRowKeys(allGroupKeys);
      setHasExpandedInitially(true);
    }
  }, [open, allGroupKeys, hasExpandedInitially]);

  const totalColumns = isMobile ? 2 : 4;

  const columns = [
    {
      title: "Permiso",
      key: "permission",
      width: 320,
      render: (_: any, record: PermissionTreeNode) => {
        if (record.isGroup) {
          const isExpanded = expandedRowKeys.map(String).includes(String(record.key));
          const isRoot = record.depth === 0;
          return {
            children: (
              <Space
                style={{ display: "flex", alignItems: "center", marginLeft: record.depth * 16 }}
                size={6}
              >
                {isExpanded ? (
                  <DownOutlined style={{ fontSize: 10, color: isRoot ? "#1677ff" : "#8c8c8c" }} />
                ) : (
                  <RightOutlined style={{ fontSize: 10, color: isRoot ? "#1677ff" : "#8c8c8c" }} />
                )}
                {isRoot && (
                  <div style={{ width: 4, height: 16, background: "#1677ff", borderRadius: 2, flexShrink: 0 }} />
                )}
                <Text
                  strong
                  type={isRoot ? undefined : "secondary"}
                  style={isRoot ? { letterSpacing: "0.07em", textTransform: "uppercase" } : undefined}
                >
                  {record.title}
                </Text>
              </Space>
            ),
            props: { colSpan: isRoot ? totalColumns : 1 },
          };
        }

        const indent = ((record.depth ?? 1)) * 16;
        return (
          <div style={{ paddingLeft: indent, borderLeft: "1px solid #f0f0f0", marginLeft: 4 }}>
            <Space vertical size={0}>
              <Text>{record.title}</Text>
              <Text type="secondary" style={{ fontFamily: "monospace", fontSize: isMobile ? 11 : undefined }}>
                {record.slug}
              </Text>
            </Space>
          </div>
        );
      },
    },
    ...(!isMobile ? [
      {
        title: "Impacto",
        key: "impact",
        width: 120,
        render: (_: any, record: PermissionTreeNode) => {
          if (record.isGroup && record.depth === 0) return { props: { colSpan: 0 } };

          const permissionIds = record.isGroup
            ? collectLeafKeys(record).map(Number)
            : [record.permissionId as number];

          if (permissionIds.length === 0) return null;

          const assignedRoles = roles.filter(r =>
            r.permissions?.some(pid => permissionIds.includes(Number(pid)))
          );

          if (assignedRoles.length === 0) return <Text type="secondary">Sin asignar</Text>;

          return (
            <Tooltip title={
              <div>
                <div style={{ marginBottom: "4px", fontWeight: "bold" }}>Roles afectados:</div>
                {assignedRoles.map(r => <div key={r.id}>• {r.name}</div>)}
              </div>
            }>
              <Tag icon={<TeamOutlined />} color={record.isGroup ? "orange" : "blue"} style={{ cursor: "help" }}>
                {assignedRoles.length} {assignedRoles.length === 1 ? "rol" : "roles"}
              </Tag>
            </Tooltip>
          );
        }
      },
      {
        title: "Descripción",
        key: "description",
        render: (_: any, record: PermissionTreeNode) => {
          if (record.isGroup && record.depth === 0) return { props: { colSpan: 0 } };
          if (record.isGroup) return null;
          return (
            <Text type="secondary">
              {record.description || "S/D"}
            </Text>
          );
        },
      },
    ] : []),
  ];

  return (
    <Drawer
      title={
        <Space align="center" size="small">
          <KeyOutlined />
          <Text strong>
            Glosario de Permisos
          </Text>
        </Space>
      }
      placement={isMobile ? "bottom" : "right"}
      size={isMobile ? undefined : "large"}
      styles={isMobile ? { wrapper: { height: '92vh' } } : undefined}
      onClose={onClose}
      open={open}
      extra={
        !isMobile ? (
          <Space size="middle">
            <Input
              placeholder="Buscar permiso..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 180 }}
              allowClear
            />
            <Space.Compact size="small">
              <Button
                icon={<ExpandOutlined />}
                onClick={() => setExpandedRowKeys(allGroupKeys)}
              >
                Expandir
              </Button>
              <Button
                icon={<CompressOutlined />}
                onClick={() => setExpandedRowKeys([])}
              >
                Colapsar
              </Button>
            </Space.Compact>
          </Space>
        ) : undefined
      }
    >
      {isMobile && (
        <Input
          placeholder="Buscar permiso..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
          allowClear
        />
      )}
      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: "#fafafa",
          borderRadius: "8px",
          border: "1px solid #f0f0f0",
        }}
      >
        <Text type="secondary">
          <Badge
            status="processing"
            text={`${permissions.length} acciones configuradas`}
          />
        </Text>
      </div>

      <Table
        columns={columns}
        dataSource={groupedData as any}
        rowKey="key"
        loading={loading}
        pagination={false}
        size="small"
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
          expandRowByClick: true,
          showExpandColumn: false,
          rowExpandable: (record: any) => record.isGroup && !!record.children?.length,
        }}
        onRow={(record: any) => ({
          style: {
            background: record.isGroup && record.depth === 0 ? '#fafafa' : undefined,
            cursor: record.isGroup ? 'pointer' : 'default',
          },
        })}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No se encontraron permisos" />
        }}
      />
    </Drawer>
  );
};
