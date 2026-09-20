import { Button, Space, Typography, Tag, Modal, theme, Grid, Pagination, Tooltip } from 'antd';
import { DataTable } from '@src/components/DataTable';
import { SafetyCertificateOutlined, EditOutlined, ReloadOutlined, DeleteOutlined, LoadingOutlined, KeyOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';


const { useBreakpoint } = Grid;
import { rolesService, type Role, type Permission } from '../services/roles.service';
import { RoleFormModal } from '../components/RoleFormModal';
import { PermissionsDrawer } from '../components/PermissionsDrawer';
import { StandardPageLayout } from '@src/components/ui/StandardPageLayout';
import { FilterContainer, FilterSelect } from '@src/components/ui/StandardFilters';
import { MobileDeleteConfirm } from '@src/components/MobileDeleteConfirm';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useAuth } from '@src/providers/auth-provider';
import { PERMISSIONS } from '@src/core/permissions.constants';
import { useDebounce } from '@src/core/hooks';

const { Text } = Typography;

export const RolesManagementPage = () => {
    const { token } = theme.useToken();
    const screens = useBreakpoint();
    const isMobile = !screens.md;

    const { hasPermission } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [total, setTotal] = useState(0);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);

    // Filtros
    const [nameFilter, setNameFilter] = useState<string>('');
    const debouncedNameFilter = useDebounce(nameFilter, 500);
    const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Modals y Drawer
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [modalLoading, setModalLoading] = useState(false);

    const fetchData = useCallback((page: number, size: number) => {
        setLoading(true);

        Promise.all([
            rolesService.getRoles({
                name: debouncedNameFilter || undefined,
                enable: statusFilter,
                page,
                page_size: size
            }),
            rolesService.getPermissions()
        ])
            .then(([rolesRes, permsData]) => {
                setRoles(rolesRes.data || []);
                setTotal(rolesRes.total || 0);
                setPermissions(permsData);
                setCurrentPage(page);
                setPageSize(size);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [debouncedNameFilter, statusFilter]);

    // Se lee al disparar, no es disparador: con `pageSize` en las dependencias,
    // el botón de "ver más" (que lo sube) provocaría una segunda carga.
    const pageSizeRef = useRef(pageSize);
    pageSizeRef.current = pageSize;

    useEffect(() => {
        fetchData(1, pageSizeRef.current);
    }, [fetchData]);

    // Pull-to-refresh para mobile
    const { containerRef, pullDistance, isRefreshing: isPulling } = usePullToRefresh({
        onRefresh: () => fetchData(1, pageSize),
        enabled: isMobile,
    });

    const handleCreate = () => {
        setSelectedRole(null);
        setIsModalOpen(true);
    };

    const handleEdit = (role: Role) => {
        setSelectedRole(role);
        setIsModalOpen(true);
    };

    const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
    const handleDelete = (id: number) => {
        rolesService.deleteRole(id)
            .then(success => {
                if (success) fetchData(1, pageSize);
            });
    };
    const confirmDeleteRole = () => {
        if (!deleteTarget) return;
        handleDelete(deleteTarget.id);
        setDeleteTarget(null);
    };

    const handleSaveRole = (values: any) => {
        setModalLoading(true);
        const request = selectedRole
            ? rolesService.updateRole({ ...values, id: selectedRole.id })
            : rolesService.createRole(values);

        request
            .then(res => {
                if (res) {
                    setIsModalOpen(false);
                    fetchData(1, pageSize);
                }
            })
            .finally(() => setModalLoading(false));
    };

    const actionButtons = (record: Role) => (
        <Space size={isMobile ? 'middle' : 'small'}>
            {hasPermission(PERMISSIONS.ROLES.MANAGE) && (
                <Tooltip title={record.is_system ? 'Bloqueado' : 'Editar'}>
                    <Button
                        type="text"
                        size={isMobile ? 'large' : 'middle'}
                        disabled={record.is_system}
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    />
                </Tooltip>
            )}
            {hasPermission(PERMISSIONS.ROLES.MANAGE) && (
                <Tooltip title={record.is_system ? 'Protegido' : 'Eliminar'}>
                    <Button
                        type="text"
                        size={isMobile ? 'large' : 'middle'}
                        danger
                        disabled={record.is_system}
                        icon={<DeleteOutlined />}
                        onClick={() => {
                            if (isMobile) { setDeleteTarget(record); return; }
                            Modal.confirm({
                                title: '¿Eliminar este rol?',
                                content: 'Esta acción es irreversible y removerá todos los permisos asociados.',
                                okText: 'Eliminar',
                                okType: 'danger',
                                cancelText: 'Cancelar',
                                onOk: () => handleDelete(record.id)
                            });
                        }}
                    />
                </Tooltip>
            )}
        </Space>
    );

    const columns = isMobile ? [
        {
            title: 'Rol de Sistema',
            key: 'name',
            render: (_: any, record: Role) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Space align="start">
                        <SafetyCertificateOutlined />
                        <div>
                            <Text strong>{record.name}</Text>
                            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {record.is_system && <Tag color="purple">SISTEMA</Tag>}
                                <Tag color={record.enable ? 'success' : 'error'}>
                                    {record.enable ? 'ACTIVO' : 'INACTIVO'}
                                </Tag>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                                {(record.permissions?.length || 0)} / {permissions.length} acciones
                            </Text>
                        </div>
                    </Space>
                    {actionButtons(record)}
                </div>
            ),
        },
    ] : [
        {
            title: 'Rol de Sistema',
            key: 'name',
            width: 280,
            sorter: (a: Role, b: Role) => a.name.localeCompare(b.name),
            render: (_: any, record: Role) => (
                <Space align="start">
                    <SafetyCertificateOutlined />
                    <Space vertical size={0}>
                        <Text strong>{record.name}</Text>
                        {record.is_system && <Tag color="purple">SISTEMA</Tag>}
                    </Space>
                </Space>
            ),
        },
        {
            title: 'Permisos',
            key: 'permissions_count',
            width: 180,
            render: (_: any, record: Role) => (
                <Text type="secondary">
                    {(record.permissions?.length || 0)} / {permissions.length} acciones
                </Text>
            ),
        },
        {
            title: 'Estado',
            key: 'enable',
            width: 120,
            render: (_: any, record: Role) => (
                <Tag color={record.enable ? 'success' : 'error'}>
                    {record.enable ? 'ACTIVO' : 'INACTIVO'}
                </Tag>
            ),
        },
        {
            title: 'Acciones',
            key: 'actions',
            align: 'center' as const,
            fixed: 'right' as const,
            width: 150,
            render: (_: any, record: Role) => actionButtons(record),
        },
    ];

  const handleResetFilters = () => {
    setNameFilter("");
    setStatusFilter(undefined);
    fetchData(1, pageSize);
  };

  const filtersNode = (
    <FilterContainer>
      <FilterSelect
        label="Estado"
        options={[
          { label: "Activos", value: "true" },
          { label: "Inactivos", value: "false" },
        ]}
        onChange={(val) => setStatusFilter(val === "true" ? true : val === "false" ? false : undefined)}
        value={statusFilter === true ? "true" : statusFilter === false ? "false" : undefined}
      />
    </FilterContainer>
  );

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      {isMobile && (pullDistance > 0 || isPulling) && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: pullDistance || 40,
          overflow: 'hidden',
          transition: pullDistance === 0 ? 'height 0.2s ease' : undefined,
          color: token.colorPrimary,
          fontSize: 13,
          gap: 8,
        }}>
          {isPulling ? <LoadingOutlined spin /> : <ReloadOutlined />}
          {isPulling ? 'Actualizando...' : pullDistance >= 80 ? 'Soltar para actualizar' : 'Desliza hacia abajo'}
        </div>
      )}

      <StandardPageLayout
        title="Control de Accesos"
        subtitle="Gestiona los roles del sistema y niveles de permisos"
        icon={<SafetyCertificateOutlined />}
        totalCount={total}
        searchValue={nameFilter}
        onSearchChange={setNameFilter}
        onRefresh={() => fetchData(currentPage, pageSize)}
        primaryAction={{
          label: "Nuevo Rol",
          onClick: handleCreate,
          canExecute: hasPermission(PERMISSIONS.ROLES.MANAGE),
        }}
        extraActions={
          <Button icon={<KeyOutlined />} size="large" onClick={() => setIsDrawerOpen(true)}>
            Glosario
          </Button>
        }
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
            dataSource={roles}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={isMobile ? undefined : { x: 800 }}
            scrollHeight="calc(100vh - 430px)"
            onLoadMore={
              isMobile && roles.length < total
                ? () => fetchData(1, pageSize + 10)
                : undefined
            }
            mobileTotal={isMobile ? total : undefined}
            onRow={() => ({
              style: {
                contentVisibility: "auto",
                containIntrinsicSize: "0 80px",
                cursor: "pointer",
              } as React.CSSProperties,
            })}
          />

          {!isMobile && total > 0 && (
            <div
              style={{
                padding: "12px 0 0 0",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <Pagination
                size="small"
                current={currentPage}
                pageSize={pageSize}
                total={total}
                onChange={(page, size) => {
                  fetchData(page, size);
                }}
                showSizeChanger
                showTotal={(total) => `Total: ${total} roles registrados`}
              />
            </div>
          )}
        </div>
      </StandardPageLayout>

      <RoleFormModal
        open={isModalOpen}
        role={selectedRole}
        permissions={permissions}
        loading={modalLoading}
        onCancel={() => setIsModalOpen(false)}
        onSave={handleSaveRole}
      />

      <PermissionsDrawer
        open={isDrawerOpen}
        permissions={permissions}
        loading={loading}
        onClose={() => setIsDrawerOpen(false)}
      />

      {isMobile && (
        <MobileDeleteConfirm
          open={!!deleteTarget}
          title="Eliminar Rol"
          description={`Se eliminarán todos los permisos asociados al rol "${deleteTarget?.name || ""}".`}
          onConfirm={confirmDeleteRole}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export const RolesManagementPageDefault = RolesManagementPage;
