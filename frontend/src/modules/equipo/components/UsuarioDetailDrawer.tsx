import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Grid,
  Skeleton,
  Space,
  Typography,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { UserData, usersService } from "../services/users.service";
import { useAuth } from "@src/providers/auth-provider";
import { PERMISSIONS } from "@src/core/permissions.constants";
import { capitalizeWords, getInitials } from "@src/core/parse";
import { getColorString } from "@src/core/color";

const { Text, Title } = Typography;

interface UsuarioDetailDrawerProps {
  open: boolean;
  usuarioId: number | null;
  onClose: () => void;
  onEdit: () => void;
}

const Field = ({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) => (
  <div style={{ marginBottom: 8 }}>
    <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
      {label}
    </Text>
    <Text>{value ?? <Text type="secondary">—</Text>}</Text>
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      opacity: 0.5,
      margin: "16px 0 8px",
    }}
  >
    {children}
  </div>
);

export const UsuarioDetailDrawer = ({
  open,
  usuarioId,
  onClose,
  onEdit,
}: UsuarioDetailDrawerProps) => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { hasPermission } = useAuth();

  const [usuario, setUsuario] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);

  const canEdit = hasPermission(PERMISSIONS.USUARIOS.EDIT);

  useEffect(() => {
    if (!open || !usuarioId) {
      setUsuario(null);
      return;
    }
    setLoading(true);
    usersService
      .getUserById(usuarioId)
      .then((data) => setUsuario(data))
      .finally(() => setLoading(false));
  }, [open, usuarioId]);

  const fullName = usuario
    ? capitalizeWords(
        `${usuario.first_name || ""} ${usuario.last_name || ""}`.trim(),
      )
    : "";

  const renderContent = () => {
    if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
    if (!usuario) return null;

    return (
      <>
        {/* Header */}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          {usuario.foto_url ? (
            <Avatar
              src={usuario.foto_url}
              size={64}
              style={{ flexShrink: 0 }}
            />
          ) : (
            <Avatar
              size={64}
              style={{
                backgroundColor: getColorString(fullName),
                fontSize: 22,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {getInitials(fullName)}
            </Avatar>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title level={5} style={{ margin: 0 }} ellipsis={{ tooltip: true }}>
              {fullName || "—"}
            </Title>
            {usuario.cargo && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {usuario.cargo}
              </Text>
            )}
            <Space size={4} style={{ marginTop: 6, flexWrap: "wrap" }}>
              <Badge
                status={usuario.enable ? "success" : "error"}
                text={usuario.enable ? "Activo" : "Inactivo"}
              />
            </Space>
          </div>
        </div>

        {/* Info personal */}
        <SectionTitle>Información personal</SectionTitle>
        <Field label="Correo electrónico" value={usuario.email} />
        <Field label="Teléfono" value={usuario.phone || usuario.telefono} />
        <Field label="DNI" value={usuario.dni} />
      </>
    );
  };

  return (
    <Drawer
      title="Detalle de usuario"
      placement={isMobile ? "bottom" : "right"}
      open={open}
      onClose={onClose}
      size="default"
      styles={isMobile ? { wrapper: { height: "90vh" } } : { wrapper: { width: 420 } }}
      extra={
        canEdit ? (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={onEdit}
            size="small"
          >
            Editar
          </Button>
        ) : undefined
      }
    >
      {renderContent()}
    </Drawer>
  );
};
