import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  MoreOutlined,
  TeamOutlined,
} from "@ant-design/icons";

import { useAuth } from "@src/providers/auth-provider";
import { PERMISSIONS } from "@src/core/permissions.constants";
import {
  Avatar,
  Button,
  Dropdown,
  Modal,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
  Grid,
  Pagination,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { ChangePasswordModal } from "../components/ChangePasswordModal";
import { UserFormModal } from "../components/UserFormModal";
import { UsuarioDetailDrawer } from "../components/UsuarioDetailDrawer";
import {
  type UserData,
  usersService,
} from "../services/users.service";
import { type Permission, type Role, rolesService } from "../../configuracion/services/roles.service";
import { capitalizeWords, getInitials } from "@src/core/parse";
import { getColorString } from "@src/core/color";
import { useDebounce } from "@src/core/hooks";
import { DataTable } from "@src/components/DataTable";
import { StandardPageLayout } from "@src/components/ui/StandardPageLayout";
import { MobileDeleteConfirm } from "@src/components/MobileDeleteConfirm";

const { Text } = Typography;

const nombreDe = (u: UserData) =>
  capitalizeWords(
    u.names || `${u.first_name || ""} ${u.last_name || ""}`.trim(),
  ) || "este usuario";

export const UsersManagementPage = () => {
  const { hasPermission, user: currentUser } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [users, setUsers] = useState<UserData[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  const [nameFilter, setNameFilter] = useState<string>("");
  const debouncedNameFilter = useDebounce(nameFilter, 250);
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(
    undefined,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);

  const fetchData = useCallback((page: number, size: number) => {
    setLoading(true);
    return usersService
      .getPaginatedUsers({
        page,
        page_size: size,
        search: debouncedNameFilter || undefined,
        enable: statusFilter,
      })
      .then((res) => {
        let rawUsers = res.data || [];
        if (currentUser?.id !== 1) {
          rawUsers = rawUsers.filter((u) => u.id !== 1);
        }
        setUsers(rawUsers);
        setTotal(res.total || 0);
        setCurrentPage(page);
        setPageSize(size);
      })
      .finally(() => setLoading(false));
  }, [debouncedNameFilter, statusFilter, currentUser?.id]);

  const fetchInitialData = useCallback(() => {
    setLoading(true);
    rolesService
      .getRoles({ page: 1, page_size: 1000 })
      .then((res) => {
        setRoles(res.data);
      })
      .catch((error) =>
        console.error("Error al cargar datos estáticos:", error),
      )
      .finally(() => setLoading(false));
    // Catálogo para los permisos específicos del formulario ([] si falla).
    rolesService.getPermissions().then(setPermissions);
  }, []);

  const fetchAllUsers = useCallback(() => {
    usersService
      .getPaginatedUsers({ page: 1, page_size: 1000, enable: true })
      .then((res) => setAllUsers(res.data || []));
  }, []);

  useEffect(() => {
    fetchInitialData();
    fetchAllUsers();
  }, [fetchInitialData, fetchAllUsers]);

  // Se lee al disparar, no es disparador: con `pageSize` en las dependencias,
  // el botón de "ver más" (que lo sube) provocaría una segunda carga.
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;

  useEffect(() => {
    fetchData(1, pageSizeRef.current);
  }, [fetchData]);

  const handleAddUser = () => {
    setSelectedUser(null);
    setIsFormModalOpen(true);
  };
  // Carga datos completos del usuario antes de abrir el formulario de edición,
  // ya que la lista solo devuelve campos básicos (sin banco, salario, etc.)
  const handleEditUser = useCallback((user: UserData) => {
    usersService.getUserById(user.id).then((fullUser) => {
      setSelectedUser(fullUser || user);
      setIsFormModalOpen(true);
    });
  }, []);
  const handleViewUser = useCallback((user: UserData) => {
    setDetailUserId(user.id);
    setIsDetailOpen(true);
  }, []);
  const handleEditFromDetail = () => {
    if (detailUserId) {
      usersService.getUserById(detailUserId).then((fullUser) => {
        if (fullUser) {
          setSelectedUser(fullUser);
          setIsFormModalOpen(true);
        }
      });
    }
    setIsDetailOpen(false);
  };
  const handleChangePassword = useCallback((user: UserData) => {
    setSelectedUser(user);
    setIsPassModalOpen(true);
  }, []);

  const handleDeleteUser = useCallback((user: UserData) => {
    if (isMobile) {
      setDeleteTarget(user);
      return;
    }
    Modal.confirm({
      title: "¿Eliminar este usuario?",
      content: "Se desactivará su acceso al sistema.",
      okText: "Eliminar",
      okType: "danger",
      cancelText: "Cancelar",
      // El foco arranca en Cancelar: un Enter por inercia no elimina a nadie.
      focusable: { autoFocusButton: "cancel" },
      onOk: () =>
        usersService.deleteUser(user).then((success) => {
          if (success) setUsers((prev) => prev.filter((u) => u.id !== user.id));
        }),
    });
  }, [isMobile]);

  const confirmDeleteUser = () => {
    if (!deleteTarget) return;
    usersService.deleteUser(deleteTarget).then((success) => {
      if (success) setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    });
    setDeleteTarget(null);
  };

  const handleFotoChange = (userId: number, fotoUrl: string | null) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, foto_url: fotoUrl } : u)),
    );
  };

  const handleSaveUser = (values: any) => {
    setModalLoading(true);
    const action = selectedUser
      ? usersService.updateUser({ ...selectedUser, ...values })
      : usersService.createUser(values);
    return action
      .then((result) => {
        if (result) {
          if (selectedUser) {
            setUsers((prev) => prev.map((u) => (u.id === result.id ? result : u)));
          } else {
            setUsers((prev) => [...prev, result]);
          }
          setIsFormModalOpen(false);
          fetchData(currentPage, pageSize);
          fetchAllUsers();
        }
      })
      .finally(() => setModalLoading(false));
  };

  const handleSavePassword = (values: any) => {
    setModalLoading(true);
    return usersService
      .changePassword(values)
      .then((success) => {
        if (success) setIsPassModalOpen(false);
      })
      .finally(() => setModalLoading(false));
  };

  /** Por qué no se puede eliminar a este usuario, o `null` si sí se puede. */
  const motivoProtegido = useCallback(
    (record: UserData): string | null => {
      if (record.id === 1) return "administrador protegido";
      if (record.id === currentUser?.id) return "es tu propia cuenta";
      if (record.is_system_user) return "usuario de sistema";
      return null;
    },
    [currentUser?.id],
  );

  const columns = useMemo<ColumnsType<UserData>>(() => {
    if (isMobile) {
      return [
        {
          title: "Usuario",
          key: "user",
          render: (_, record) => {
            const fullName = capitalizeWords(
              record.names ||
                `${record.first_name || ""} ${record.last_name || ""}`.trim(),
            );
            return (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  padding: "4px 0",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 12 }}>
                  {record.foto_url ? (
                    <Avatar
                      src={record.foto_url}
                      size={36}
                      style={{ flexShrink: 0 }}
                    />
                  ) : (
                    <Avatar
                      style={{
                        backgroundColor: getColorString(fullName),
                        fontSize: "11px",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {getInitials(fullName)}
                    </Avatar>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      strong
                      ellipsis={{ tooltip: true }}
                      style={{ display: "block" }}
                    >
                      {fullName || "Sin nombre"}
                    </Text>
                    {record.cargo && (
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, display: "block" }}
                      >
                        {record.cargo}
                      </Text>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        marginTop: 2,
                      }}
                    >
                      <Tag
                        color={record.enable ? "success" : "default"}
                        style={{ fontSize: 11, margin: 0 }}
                      >
                        {record.enable ? "ACTIVO" : "INACTIVO"}
                      </Tag>
                    </div>
                  </div>
                </div>
                {/* Mismas acciones que en escritorio, en un solo menú: cuatro
                    iconos de 40 px no caben con holgura en una fila de móvil. */}
                <Dropdown
                  trigger={["click"]}
                  placement="bottomRight"
                  menu={{
                    items: [
                      {
                        key: "ver",
                        icon: <EyeOutlined />,
                        label: "Ver detalle",
                        onClick: () => handleViewUser(record),
                      },
                      ...(hasPermission(PERMISSIONS.USUARIOS.EDIT)
                        ? [
                            {
                              key: "editar",
                              icon: <EditOutlined />,
                              label: "Editar",
                              onClick: () => handleEditUser(record),
                            },
                            {
                              key: "clave",
                              icon: <LockOutlined />,
                              label: "Cambiar contraseña",
                              onClick: () => handleChangePassword(record),
                            },
                          ]
                        : []),
                      ...(hasPermission(PERMISSIONS.USUARIOS.DELETE)
                        ? [
                            { type: "divider" as const },
                            {
                              key: "eliminar",
                              icon: <DeleteOutlined />,
                              danger: true,
                              disabled: !!motivoProtegido(record),
                              label: motivoProtegido(record)
                                ? `Eliminar (${motivoProtegido(record)})`
                                : "Eliminar",
                              onClick: () => handleDeleteUser(record),
                            },
                          ]
                        : []),
                    ],
                  }}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined style={{ fontSize: 20 }} />}
                    aria-label={`Acciones para ${fullName || "este usuario"}`}
                    style={{ width: 44, height: 44, flexShrink: 0 }}
                  />
                </Dropdown>
              </div>
            );
          },
        },
      ];
    }

    const cols: ColumnsType<UserData> = [
      {
        title: "",
        key: "avatar",
        width: 48,
        render: (_, record) => {
          const fullName = capitalizeWords(
            record.names ||
              `${record.first_name || ""} ${record.last_name || ""}`.trim(),
          );
          return record.foto_url ? (
            <Avatar src={record.foto_url} size={32} />
          ) : (
            <Avatar
              style={{
                backgroundColor: getColorString(fullName),
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              {getInitials(fullName)}
            </Avatar>
          );
        },
      },
      {
        title: "Nombre",
        key: "nombre",
        width: 200,
        sorter: (a, b) => (a.names || "").localeCompare(b.names || ""),
        ellipsis: true,
        render: (_, record) => {
          const fullName = capitalizeWords(
            record.names ||
              `${record.first_name || ""} ${record.last_name || ""}`.trim(),
          );
          return (
            <div style={{ overflow: "hidden" }}>
              <Text
                strong
                ellipsis={{ tooltip: true }}
                style={{ display: "block" }}
              >
                {fullName || "Sin nombre"}
              </Text>
            </div>
          );
        },
      },
      {
        title: "Cargo",
        dataIndex: "cargo",
        key: "cargo",
        width: 180,
        ellipsis: true,
        sorter: (a, b) => (a.cargo || "").localeCompare(b.cargo || ""),
        render: (cargo: string) =>
          cargo ? (
            <Text ellipsis={{ tooltip: true }}>{cargo}</Text>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: "Estado",
        dataIndex: "enable",
        key: "enable",
        width: 100,
        render: (enable: boolean) => (
          <Tag color={enable ? "success" : "default"}>
            {enable ? "ACTIVO" : "INACTIVO"}
          </Tag>
        ),
      },
    ];

    if (
      hasPermission(PERMISSIONS.USUARIOS.VIEW) ||
      hasPermission(PERMISSIONS.USUARIOS.EDIT)
    ) {
      cols.push({
        title: "Acciones",
        key: "actions",
        align: "center",
        fixed: "right",
        width: 150,
        render: (_, record) => (
          <Space size="small">
            <Tooltip title="Ver detalle">
              <Button
                type="text"
                icon={<EyeOutlined />}
                aria-label={`Ver el detalle de ${nombreDe(record)}`}
                onClick={() => handleViewUser(record)}
              />
            </Tooltip>
            {hasPermission(PERMISSIONS.USUARIOS.EDIT) && (
              <>
                <Tooltip title="Editar">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`Editar a ${nombreDe(record)}`}
                    onClick={() => handleEditUser(record)}
                  />
                </Tooltip>
                <Tooltip title="Cambiar contraseña">
                  <Button
                    type="text"
                    icon={<LockOutlined />}
                    aria-label={`Cambiar la contraseña de ${nombreDe(record)}`}
                    onClick={() => handleChangePassword(record)}
                  />
                </Tooltip>
              </>
            )}
            {hasPermission(PERMISSIONS.USUARIOS.DELETE) &&
              (motivoProtegido(record) ? (
                <Tooltip title={`No se puede eliminar: ${motivoProtegido(record)}`}>
                  <Button
                    type="text"
                    disabled
                    icon={<DeleteOutlined />}
                    aria-label={`Eliminar a ${nombreDe(record)} (no disponible: ${motivoProtegido(record)})`}
                  />
                </Tooltip>
              ) : (
                <Tooltip title="Eliminar">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={`Eliminar a ${nombreDe(record)}`}
                    onClick={() => handleDeleteUser(record)}
                  />
                </Tooltip>
              ))}
          </Space>
        ),
      });
    }
    return cols;
  }, [
    hasPermission,
    isMobile,
    motivoProtegido,
    handleViewUser,
    handleEditUser,
    handleChangePassword,
    handleDeleteUser,
  ]);

  // Un solo filtro de tres valores: va a la vista, sin popover ni "Aplicar".
  const filtroEstado = (
    <Segmented
      aria-label="Filtrar por estado"
      size="large"
      value={
        statusFilter === true
          ? "activos"
          : statusFilter === false
            ? "inactivos"
            : "todos"
      }
      onChange={(v) =>
        setStatusFilter(
          v === "activos" ? true : v === "inactivos" ? false : undefined,
        )
      }
      options={[
        { label: "Todos", value: "todos" },
        { label: "Activos", value: "activos" },
        { label: "Inactivos", value: "inactivos" },
      ]}
    />
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <StandardPageLayout
        title="Usuarios"
        subtitle="Administra los usuarios, sus accesos y roles del sistema"
        icon={<TeamOutlined />}
        totalCount={total}
        searchValue={nameFilter}
        onSearchChange={setNameFilter}
        onRefresh={() => fetchData(currentPage, pageSize)}
        primaryAction={{
          label: "Nuevo usuario",
          onClick: handleAddUser,
          canExecute: hasPermission(PERMISSIONS.USUARIOS.CREATE),
        }}
        extraActions={filtroEstado}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <DataTable
            columns={columns}
            dataSource={users}
            rowKey="id"
            loading={loading}
            size="small"
            scrollHeight="calc(100vh - 430px)"
            pagination={false}
            onLoadMore={
              isMobile && users.length < total
                ? () => fetchData(1, pageSize + 10)
                : undefined
            }
            mobileTotal={isMobile ? total : undefined}
            onRow={(record) => ({
              style: { cursor: "pointer" } as React.CSSProperties,
              onDoubleClick: () => handleViewUser(record),
            })}
          />

          {!isMobile && total > 0 && (
            <div
              style={{
                padding: "12px 0 0 0",
                display: "flex",
                justifyContent: "flex-end",
                flexShrink: 0,
              }}
            >
              <Pagination
                size="small"
                current={currentPage}
                pageSize={pageSize}
                total={total}
                onChange={(page, size) => fetchData(page, size)}
                showSizeChanger
                showTotal={(total) => `Total: ${total} usuarios`}
              />
            </div>
          )}
        </div>
      </StandardPageLayout>

      <UserFormModal
        open={isFormModalOpen}
        user={selectedUser}
        roles={roles}
        permissions={permissions}
        allUsers={allUsers}
        onCancel={() => setIsFormModalOpen(false)}
        onSave={handleSaveUser}
        onFotoChange={handleFotoChange}
        loading={modalLoading}
      />
      <ChangePasswordModal
        open={isPassModalOpen}
        userId={selectedUser?.id || null}
        onCancel={() => setIsPassModalOpen(false)}
        onSave={handleSavePassword}
        loading={modalLoading}
      />
      <UsuarioDetailDrawer
        open={isDetailOpen}
        usuarioId={detailUserId}
        onClose={() => setIsDetailOpen(false)}
        onEdit={handleEditFromDetail}
      />
      {isMobile && (
        <MobileDeleteConfirm
          open={!!deleteTarget}
          title="¿Eliminar este usuario?"
          description={`Se desactivará el acceso de "${deleteTarget?.names || deleteTarget?.email || ""}" al sistema.`}
          onConfirm={confirmDeleteUser}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};
