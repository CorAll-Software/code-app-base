import { CheckOutlined, KeyOutlined, SafetyCertificateOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Checkbox, Drawer, Empty, Form, Grid, Input, Modal, Space, Tabs, message } from "antd";
import { useEffect, useState } from "react";
import type { Permission, Role } from "../services/roles.service";
import { PermissionsTree } from "./PermissionsTree";

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
      .catch(() => message.error("Completa los campos obligatorios"));
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
        label="Nombre del rol"
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
            label: <Space><KeyOutlined />Permisos asignados</Space>,
            children: <div style={{ padding: "8px 0" }}>{renderPermissionsSelector()}</div>,
          },
          {
            key: "2",
            label: <Space><SettingOutlined />Configuración adicional</Space>,
            children: (
              <div style={{ padding: "16px 0" }}>
                <Form.Item name="description" label="Descripción del rol">
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
        title={role ? "Editar rol" : "Nuevo rol"}
        placement="bottom"
        open={open}
        onClose={onCancel}
        mask={{ closable: false }}
        styles={{ wrapper: { height: '92vh' }, body: { paddingBottom: 80 } }}
        extra={
          <Button size="large" type="primary" icon={<CheckOutlined />} loading={loading} onClick={handleOk}>Guardar</Button>
        }
      >
        {formContent}
      </Drawer>
    );
  }

  return (
    <Modal
      title={role ? "Editar rol" : "Nuevo rol"}
      open={open}
      onCancel={onCancel}
      mask={{ closable: false }}
      onOk={handleOk}
      confirmLoading={loading}
      width={820}
      centered
      okText="Guardar"
      cancelText="Cancelar"
      destroyOnHidden
    >
      {formContent}
    </Modal>
  );
};
