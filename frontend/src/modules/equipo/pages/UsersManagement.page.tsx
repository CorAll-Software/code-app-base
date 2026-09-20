import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  ReloadOutlined,
  TeamOutlined,
  LoadingOutlined,
} from "@ant-design/icons";

import { useAuth } from "@src/providers/auth-provider";
import { PERMISSIONS } from "@src/core/permissions.constants";
import {
  Avatar,
  Button,
  Modal,
  Space,
  Tag,
  theme,
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
import { rolesService } from "../../configuracion/services/roles.service";
import type { Role } from "@src/core/types";
import { capitalizeWords, getInitials } from "@src/core/parse";
import { getColorString } from "@src/core/color";
import { useDebounce } from "@src/core/hooks";
import { DataTable } from "@src/components/DataTable";
import { StandardPageLayout } from "@src/components/ui/StandardPageLayout";
import {
  FilterContainer,
  FilterSelect,
} from "@src/components/ui/StandardFilters";
import { MobileDeleteConfirm } from "@src/components/MobileDeleteConfirm";
import { usePullToRefresh } from "../../configuracion/hooks/usePullToRefresh";

const { Text } = Typography;

export const UsersManagementPage = () => {
  const { hasPermission, user: currentUser } = useAuth();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [users, setUsers] = useState<UserData[]>([]);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  const [nameFilter, setNameFilter] = useState<string>("");
  const debouncedNameFilter = useDebounce(nameFilter, 500);
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(
    undefined,
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);
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
    usersService
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
        setRoles(res.data as unknown as Role[]);
      })
      .catch((error) =>
        console.error("Error al cargar datos estáticos:", error),
      )
      .finally(() => setLoading(false));
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

  const {
    containerRef,
    pullDistance,
    isRefreshing: isPulling,
  } = usePullToRefresh({
    onRefresh: () => fetchData(currentPage, pageSize),
    enabled: isMobile,
  });

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
      title: "¿Eliminar este integrante?",
      content: "Se desactivará su acceso al sistema.",
      okText: "Eliminar",
      okType: "danger",
      cancelText: "Cancelar",
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

  const handleResetFilters = () => {
    setNameFilter("");
    setStatusFilter(undefined);
    fetchData(1, pageSize);
  };

  const columns = useMemo<ColumnsType<UserData>>(() => {
    if (isMobile) {
      return [
        {
          title: "Integrante",
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
                        color={record.enable ? "success" : "error"}
                        style={{ fontSize: 10, margin: 0 }}
                      >
                        {record.enable ? "ACTIVO" : "INACTIVO"}
                      </Tag>
                    </div>
                  </div>
                </div>
                <Space size="middle">
                  <Button
                    type="text"
                    size="large"
                    icon={<EyeOutlined />}
                    onClick={() => handleViewUser(record)}
                  />
                  {hasPermission(PERMISSIONS.USUARIOS.EDIT) && (
                    <Button
                      type="text"
                      size="large"
                      icon={<EditOutlined />}
                      onClick={() => handleEditUser(record)}
                    />
                  )}
                  {hasPermission(PERMISSIONS.USUARIOS.DELETE) &&
                    !record.is_system_user &&
                    record.id !== 1 &&
                    record.id !== currentUser?.id && (
                      <Button
                        type="text"
                        size="large"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteUser(record)}
                      />
                    )}
                  {(record.id === 1 || record.id === currentUser?.id) && (
                    <Tooltip
                      title={
                        record.id === 1
                          ? "Administrador protegido"
                          : "No puedes eliminarte a ti mismo"
                      }
                    >
                      <Button
                        type="text"
                        size="large"
                        disabled
                        icon={<DeleteOutlined />}
                      />
                    </Tooltip>
                  )}
                </Space>
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
          <Tag color={enable ? "success" : "error"}>
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
                onClick={() => handleViewUser(record)}
              />
            </Tooltip>
            {hasPermission(PERMISSIONS.USUARIOS.EDIT) && (
              <>
                <Tooltip title="Editar">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    style={{ color: token.colorPrimary }}
                    onClick={() => handleEditUser(record)}
                  />
                </Tooltip>
                <Tooltip title="Cambiar clave">
                  <Button
                    type="text"
                    icon={<LockOutlined />}
                    style={{ color: token.colorInfo }}
                    onClick={() => handleChangePassword(record)}
                  />
                </Tooltip>
              </>
            )}
            {hasPermission(PERMISSIONS.USUARIOS.DELETE) &&
              (record.is_system_user ||
              record.id === 1 ||
              record.id === currentUser?.id ? (
                <Tooltip
                  title={
                    record.id === 1
                      ? "Administrador protegido"
                      : record.id === currentUser?.id
                        ? "No puedes eliminarte"
                        : "Protegido"
                  }
                >
                  <Button type="text" disabled icon={<DeleteOutlined />} />
                </Tooltip>
              ) : (
                <Tooltip title="Eliminar">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
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
    token,
    isMobile,
    currentUser?.id,
    handleViewUser,
    handleEditUser,
    handleChangePassword,
    handleDeleteUser,
  ]);

  const filtersNode = (
    <FilterContainer>
      <FilterSelect
        label="Estado"
        options={[
          { label: "Activos", value: "true" },
          { label: "Inactivos", value: "false" },
        ]}
        onChange={(val) =>
          setStatusFilter(
            val === "true" ? true : val === "false" ? false : undefined,
          )
        }
        value={
          statusFilter === true
            ? "true"
            : statusFilter === false
              ? "false"
              : undefined
        }
      />
    </FilterContainer>
  );

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
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
          {isPulling
            ? "Actualizando..."
            : pullDistance >= 80
              ? "Soltar para actualizar"
              : "Desliza hacia abajo"}
        </div>
      )}

      <StandardPageLayout
        title="Gestión de Usuarios"
        subtitle="Administra los usuarios, sus accesos y roles del sistema"
        icon={<TeamOutlined />}
        totalCount={total}
        searchValue={nameFilter}
        onSearchChange={setNameFilter}
        onRefresh={() => fetchData(currentPage, pageSize)}
        primaryAction={{
          label: "Nuevo",
          onClick: handleAddUser,
          canExecute: hasPermission(PERMISSIONS.USUARIOS.CREATE),
        }}
        filters={filtersNode}
        isFilterOpen={isFilterOpen}
        setIsFilterOpen={setIsFilterOpen}
        onClearFilters={handleResetFilters}
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
            scroll={isMobile ? undefined : { x: 1100 }}
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
                showTotal={(total) => `Total: ${total} integrantes`}
              />
            </div>
          )}
        </div>
      </StandardPageLayout>

      <UserFormModal
        open={isFormModalOpen}
        user={selectedUser}
        roles={roles}
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
          title="Eliminar Integrante"
          description={`Se desactivará el acceso de "${deleteTarget?.names || deleteTarget?.email || ""}" al sistema.`}
          onConfirm={confirmDeleteUser}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};
