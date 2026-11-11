import { Button, Space, Typography, Tag, Modal, Grid, Pagination, Segmented, Tooltip } from 'antd';
import { DataTable } from '@src/components/DataTable';
import { SafetyCertificateOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';


const { useBreakpoint } = Grid;
import { rolesService, type Role, type Permission } from '../services/roles.service';
import { RoleFormModal } from '../components/RoleFormModal';
import { PermissionsDrawer } from '../components/PermissionsDrawer';
import { StandardPageLayout } from '@src/components/ui/StandardPageLayout';
import { MobileDeleteConfirm } from '@src/components/MobileDeleteConfirm';
import { useAuth } from '@src/providers/auth-provider';
import { PERMISSIONS } from '@src/core/permissions.constants';
import { useDebounce } from '@src/core/hooks';

const { Text } = Typography;

export const RolesManagementPage = () => {
    const screens = useBreakpoint();
    const isMobile = !screens.md;

    const { hasPermission } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [total, setTotal] = useState(0);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);

    // Filtros
    const [nameFilter, setNameFilter] = useState<string>('');
    const debouncedNameFilter = useDebounce(nameFilter, 250);
    const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Modals y Drawer
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [modalLoading, setModalLoading] = useState(false);

    const fetchData = useCallback((page: number, size: number) => {
        setLoading(true);

        return Promise.all([
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
                <Tooltip title={record.is_system ? 'Rol de sistema: no se puede editar' : 'Editar'}>
                    <Button
                        aria-label={`Editar el rol ${record.name}`}
                        type="text"
                        size={isMobile ? 'large' : 'middle'}
                        disabled={record.is_system}
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    />
                </Tooltip>
            )}
            {hasPermission(PERMISSIONS.ROLES.MANAGE) && (
                <Tooltip title={record.is_system ? 'Rol de sistema: no se puede eliminar' : 'Eliminar'}>
                    <Button
                        aria-label={`Eliminar el rol ${record.name}`}
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
                                // El foco arranca en Cancelar: un Enter por inercia no borra el rol.
                                focusable: { autoFocusButton: 'cancel' },
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
            title: 'Rol',
            key: 'name',
            render: (_: any, record: Role) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Space align="start">
                        <SafetyCertificateOutlined />
                        <div>
                            <Text strong>{record.name}</Text>
                            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {record.is_system && <Tag color="purple">SISTEMA</Tag>}
                                <Tag color={record.enable ? 'success' : 'default'}>
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
            title: 'Rol',
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
                <Tag color={record.enable ? 'success' : 'default'}>
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

  // Un solo filtro de tres valores: va a la vista, sin popover ni "Aplicar".
  const filtroEstado = (
    <Segmented
      aria-label="Filtrar por estado"
      size="large"
      value={statusFilter === true ? "activos" : statusFilter === false ? "inactivos" : "todos"}
      onChange={(v) => setStatusFilter(v === "activos" ? true : v === "inactivos" ? false : undefined)}
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
        title="Roles y permisos"
        subtitle="Gestiona los roles del sistema y niveles de permisos"
        icon={<SafetyCertificateOutlined />}
        totalCount={total}
        searchValue={nameFilter}
        onSearchChange={setNameFilter}
        onRefresh={() => fetchData(currentPage, pageSize)}
        primaryAction={{
          label: "Nuevo rol",
          onClick: handleCreate,
          canExecute: hasPermission(PERMISSIONS.ROLES.MANAGE),
        }}
        extraActions={
          <>
            {filtroEstado}
            <Button icon={<KeyOutlined />} size="large" onClick={() => setIsDrawerOpen(true)}>
              Ver permisos
            </Button>
          </>
        }
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
                showTotal={(total) => `Total: ${total} roles`}
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
          title="¿Eliminar este rol?"
          description={`Se eliminarán todos los permisos asociados al rol "${deleteTarget?.name || ""}".`}
          onConfirm={confirmDeleteRole}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export const RolesManagementPageDefault = RolesManagementPage;
