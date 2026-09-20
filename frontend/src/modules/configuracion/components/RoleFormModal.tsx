import { CheckOutlined, KeyOutlined, SafetyCertificateOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
import { Badge, Button, Checkbox, Drawer, Empty, Form, Grid, Input, Modal, Space, Tabs, Tree, Typography, message, theme } from "antd";
import { type Key, useEffect, useMemo, useState } from "react";
import {
  type PermissionTreeNode,
  buildPermissionTree,
  collectGroupKeys,
  filterPermissions,
} from "../services/modules.config";
import type { Permission, Role } from "../services/roles.service";

const { Text } = Typography;
const { useBreakpoint } = Grid;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RoleFormModalProps {
  open: boolean;
  role: Role | null;
  permissions: Permission[];
  loading: boolean;
  onCancel: () => void;
  onSave: (values: any) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionsTree — selector de permisos en árbol (un solo panel, auto-agrupado)
// ─────────────────────────────────────────────────────────────────────────────

interface PermissionsTreeProps {
  value?: string[];
  onChange?: (keys: string[]) => void;
  permissions: Permission[];
}

const isLeafKey = (key: Key): boolean => /^\d+$/.test(String(key));

const PermissionsTree = ({ value: selectedKeys = [], onChange, permissions }: PermissionsTreeProps) => {
  const { token } = theme.useToken();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => filterPermissions(permissions, search), [permissions, search]);
  const treeData = useMemo(() => buildPermissionTree(filtered), [filtered]);
  const allGroupKeys = useMemo(() => collectGroupKeys(treeData), [treeData]);

  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  useEffect(() => { setExpandedKeys(allGroupKeys); }, [allGroupKeys]);

  const titleRender = (node: PermissionTreeNode) => {
    if (node.isGroup) {
      const isRoot = node.depth === 0;
      return (
        <Text
          strong={isRoot}
          type={isRoot ? undefined : "secondary"}
          style={{
            fontSize: isRoot ? 13 : 12,
            letterSpacing: isRoot ? "0.04em" : undefined,
          }}
        >
          {node.title}
        </Text>
      );
    }
    return (
      <Space vertical size={0}>
        <Text style={{ fontSize: 13 }}>{node.title}</Text>
        <Text style={{ fontSize: 10, fontFamily: "monospace", color: token.colorTextQuaternary }}>
          {node.slug}
        </Text>
      </Space>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Input
          size="small"
          placeholder="Buscar permiso..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <Badge count={selectedKeys.length} overflowCount={999} color={token.colorPrimary} />
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        paddingBottom: 4,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {selectedKeys.length} / {permissions.length} permisos
        </Text>
        <Space size={2}>
          <Button type="link" size="small" style={{ fontSize: 11, padding: "0 4px" }} onClick={() => setExpandedKeys(allGroupKeys)}>
            Expandir todo
          </Button>
          <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
          <Button type="link" size="small" style={{ fontSize: 11, padding: "0 4px" }} onClick={() => setExpandedKeys([])}>
            Colapsar todo
          </Button>
        </Space>
      </div>

      <div style={{
        height: 400,
        overflowY: "auto",
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        padding: "4px 8px",
      }}>
        {treeData.length === 0 ? (
          <Empty description="Sin permisos" style={{ padding: "40px 0" }} />
        ) : (
          <Tree
            checkable
            selectable={false}
            blockNode
            checkedKeys={selectedKeys}
            onCheck={(checked) => {
              const next = (checked as Key[]).filter(isLeafKey).map(String);
              onChange?.(next);
            }}
            expandedKeys={expandedKeys}
            onExpand={(ks) => setExpandedKeys(ks)}
            treeData={treeData as any}
            fieldNames={{ title: "title", key: "key", children: "children" }}
            titleRender={titleRender as any}
          />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// RoleFormModal
// ─────────────────────────────────────────────────────────────────────────────

export const RoleFormModal = ({
  open, role, permissions, loading, onCancel, onSave,
}: RoleFormModalProps) => {
  const [form] = Form.useForm();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [activeTab, setActiveTab] = useState("1");

  useEffect(() => {
    if (open) {
      form.resetFields();
      setActiveTab("1");
      if (role) {
        form.setFieldsValue({
          ...role,
          enable: role.enable ?? true,
          permissions_ids: (role.permissions || []).map((id) => id.toString()),
        });
      } else {
        form.setFieldsValue({ enable: true, status: true, permissions_ids: [] });
      }
    }
  }, [open, role, form]);

  const handleOk = () => {
    form
      .validateFields()
      .then((values) => {
        onSave({
          ...values,
          permissions_ids: (values.permissions_ids || []).map((id: string) => parseInt(id, 10)),
        });
      })
      .catch(() => message.error("Por favor complete los campos obligatorios"));
  };

  const renderPermissionsSelector = () => {
    if (permissions.length === 0) return <Empty description="No hay permisos cargados" />;
    return (
      <Form.Item name="permissions_ids" noStyle>
        <PermissionsTree permissions={permissions} />
      </Form.Item>
    );
  };

  const formContent = (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ enable: true, status: true, permissions_ids: [] }}
    >
      <Form.Item
        name="name"
        label="Nombre del Rol"
        rules={[{ required: true, message: "Requerido" }]}
      >
        <Input
          maxLength={100}
          placeholder="Ej. Administrador de Proyectos"
          prefix={<SafetyCertificateOutlined />}
        />
      </Form.Item>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "1",
            label: <Space><KeyOutlined />Permisos Asignados</Space>,
            children: <div style={{ padding: "8px 0" }}>{renderPermissionsSelector()}</div>,
          },
          {
            key: "2",
            label: <Space><SettingOutlined />Configuración Adicional</Space>,
            children: (
              <div style={{ padding: "16px 0" }}>
                <Form.Item name="description" label="Descripción del Rol">
                  <Input.TextArea
                    maxLength={255}
                    placeholder="¿Qué responsabilidades tiene este rol?"
                    rows={4}
                  />
                </Form.Item>
                <Form.Item name="enable" valuePropName="checked">
                  <Checkbox>Rol activo para el sistema</Checkbox>
                </Form.Item>
              </div>
            ),
          },
        ]}
      />
    </Form>
  );

  if (isMobile) {
    return (
      <Drawer
        title={role ? "Editar Rol" : "Nuevo Rol"}
        placement="bottom"
        open={open}
        onClose={onCancel}
        styles={{ wrapper: { height: '92vh' }, body: { paddingBottom: 80 } }}
        extra={
          <Button size="large" type="primary" icon={<CheckOutlined />} loading={loading} onClick={handleOk} />
        }
      >
        {formContent}
      </Drawer>
    );
  }

  return (
    <Modal
      title={role ? "Editar Rol" : "Nuevo Rol"}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width={820}
      centered
      okText="Guardar Cambios"
      cancelText="Cancelar"
      destroyOnHidden
    >
      {formContent}
    </Modal>
  );
};
