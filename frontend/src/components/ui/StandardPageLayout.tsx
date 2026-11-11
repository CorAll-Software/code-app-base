import React, { type ReactNode, useState, useEffect, useRef } from 'react';
import { Badge, Card, Typography, Grid, Space, Button, Dropdown, Drawer, Popover, Input, theme, Tag, type MenuProps } from 'antd';
import { FilterOutlined, SearchOutlined, AppstoreOutlined, UnorderedListOutlined, TableOutlined, PlusOutlined, ClearOutlined, CheckOutlined, ReloadOutlined, DownOutlined, LoadingOutlined } from '@ant-design/icons';
import { PULL_THRESHOLD, usePullToRefresh } from '../../modules/configuracion/hooks/usePullToRefresh';

const { Title, Text } = Typography;

export type ViewMode = 'cards' | 'list' | 'table';

export interface StandardPageLayoutProps {
    title?: string;
    subtitle?: ReactNode;
    icon?: ReactNode;
    totalCount?: number;

    // Search
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;

    // Actions
    primaryAction?: {
        label: string;
        icon?: ReactNode;
        onClick: () => void;
        canExecute?: boolean;
    };
    /** Si devuelve la promesa de la carga, el indicador de "Actualizando" dura lo que dura ella. */
    onRefresh?: () => unknown;

    // View Toggles
    viewMode?: ViewMode;
    onViewModeChange?: (mode: ViewMode) => void;
    showViewToggle?: boolean;

    // Filters
    filters?: ReactNode;
    onClearFilters?: () => void;
    onApplyFilters?: () => void;
    isFilterOpen?: boolean;
    setIsFilterOpen?: (open: boolean) => void;
    hasActiveFilters?: boolean;

    // Extra actions (rendered in the search/filter row, e.g. secondary buttons like "Descargar")
    extraActions?: ReactNode;

    // Content
    omitHeader?: boolean;
    /** Compact mode: collapses title + search + filters + actions into a single row.
     *  Use this inside tabs where the module header already provides context. */
    compact?: boolean;
    children: ReactNode;
}

export const StandardPageLayout = ({
    title,
    subtitle,
    icon,
    totalCount,
    searchValue,
    onSearchChange,
    searchPlaceholder = "Buscar...",
    primaryAction,
    onRefresh,
    viewMode,
    onViewModeChange,
    showViewToggle = false,
    filters,
    onClearFilters,
    onApplyFilters,
    isFilterOpen,
    setIsFilterOpen,
    hasActiveFilters: hasActiveFiltersProp,
    extraActions,
    omitHeader = false,
    compact = false,
    children
}: StandardPageLayoutProps) => {
    const screens = Grid.useBreakpoint();
    const { token } = theme.useToken();
    const isMobile = screens.md === false;

    // Helper para detectar de manera automática si algún filtro hijo tiene valor seleccionado
    const detectActiveFilters = (node: React.ReactNode): boolean => {
        if (!node) return false;
        if (Array.isArray(node)) {
            return node.some(detectActiveFilters);
        }
        if (React.isValidElement(node)) {
            const props = node.props as any;
            if ('value' in props) {
                const v = props.value;
                if (v != null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)) {
                    return true;
                }
            }
            if (props.children) {
                return detectActiveFilters(props.children);
            }
        }
        return false;
    };

    const hasActiveFilters = hasActiveFiltersProp !== undefined
        ? hasActiveFiltersProp
        : detectActiveFilters(filters);

    const { containerRef, pullDistance, isRefreshing } = usePullToRefresh({
        onRefresh: onRefresh ?? (() => { }),
        enabled: isMobile && !!onRefresh,
    });

    const [tempValues, setTempValues] = useState<Record<string, any>>({});
    const originalHandlersRef = useRef<Record<string, (val: any) => void>>({});

    // Sincronizar los valores reales con el estado temporal al abrir el panel de filtros
    useEffect(() => {
        if (isFilterOpen) {
            const initialValues: Record<string, any> = {};
            let filterIndex = 0;
            const gatherValues = (node: React.ReactNode) => {
                if (!node) return;
                if (Array.isArray(node)) {
                    node.forEach(gatherValues);
                    return;
                }
                if (React.isValidElement(node)) {
                    const props = node.props as any;
                    if ('value' in props || 'checked' in props || 'onChange' in props) {
                        const key = props.label || props.key || `filter_auto_${filterIndex++}`;
                        initialValues[key] = 'checked' in props ? props.checked : props.value;
                        if (props.onChange) {
                            originalHandlersRef.current[key] = props.onChange;
                        }
                    }
                    if (props.children) {
                        gatherValues(props.children);
                    }
                }
            };
            gatherValues(filters);
            setTempValues(initialValues);
        }
    }, [isFilterOpen, filters]);

    const renderFiltersWithTempState = (node: React.ReactNode): React.ReactNode => {
        let filterIndex = 0;
        const processNode = (n: React.ReactNode): React.ReactNode => {
            if (!n) return null;
            if (Array.isArray(n)) {
                return n.map(child => processNode(child));
            }
            if (React.isValidElement(n)) {
                const props = n.props as any;
                const isCheckedComponent = 'checked' in props;
                if ('value' in props || 'checked' in props || 'onChange' in props) {
                    const key = props.label || props.key || `filter_auto_${filterIndex++}`;
                    const overrideProps: any = {
                        onChange: (val: any) => {
                            const resolvedVal = (val && typeof val === 'object' && 'target' in val)
                                ? (val.target.type === 'checkbox' ? val.target.checked : val.target.value)
                                : val;
                            setTempValues(prev => ({ ...prev, [key]: resolvedVal }));
                        }
                    };
                    if (isCheckedComponent) {
                        overrideProps.checked = key in tempValues ? tempValues[key] : props.checked;
                    } else {
                        overrideProps.value = key in tempValues ? tempValues[key] : props.value;
                    }
                    return React.cloneElement(n, overrideProps);
                }
                if (props.children) {
                    return React.cloneElement(n, {
                        children: React.Children.map(props.children, child => processNode(child))
                    } as any);
                }
            }
            return n;
        };
        return processNode(node);
    };

    const handleApply = () => {
        Object.keys(tempValues).forEach(key => {
            const handler = originalHandlersRef.current[key];
            if (handler) {
                handler(tempValues[key]);
            }
        });
        onApplyFilters?.();
        setIsFilterOpen?.(false);
    };

    const handleClear = () => {
        Object.keys(originalHandlersRef.current).forEach(key => {
            const handler = originalHandlersRef.current[key];
            if (handler) {
                handler(undefined);
            }
        });
        setTempValues({});
        onClearFilters?.();
    };

    const viewItems: MenuProps['items'] = [
        { key: 'cards', icon: <AppstoreOutlined />, label: 'Tarjetas' },
        { key: 'list', icon: <UnorderedListOutlined />, label: 'Lista' },
        { key: 'table', icon: <TableOutlined />, label: 'Tabla' }
    ];

    const currentViewItem = viewItems.find(item => item?.key === viewMode);

    const filtersContent = (
        <Space orientation="vertical" style={{ width: '100%', minWidth: 250 }} size="large">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {renderFiltersWithTempState(filters)}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <Button block icon={<ClearOutlined />} onClick={handleClear}>
                    Limpiar
                </Button>
                <Button block type="primary" icon={<CheckOutlined />} onClick={handleApply}>
                    Aplicar
                </Button>
            </div>
        </Space>
    );

    // Encabezado compacto: una sola fila (desktop) o tres filas (mobile)
    const compactHeader = (
        isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                {/* Fila 1 mobile: Título + badge */}
                {title && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap' }}>{title}</Title>
                        {totalCount !== undefined && (
                            <Tag style={{ borderRadius: 10, margin: 0, fontSize: 11 }}>
                                {totalCount} total
                            </Tag>
                        )}
                    </div>
                )}

                {/* Fila 2 mobile: Extra actions (tabs) */}
                {extraActions}

                {/* Fila 3 mobile: Búsqueda + filtros */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {onSearchChange && (
                        <Input
                            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                            placeholder={searchPlaceholder}
                            allowClear
                            value={searchValue}
                            onChange={(e) => onSearchChange(e.target.value)}
                            style={{ flex: 1, minWidth: 0 }}
                            size="large"
                        />
                    )}

                    {filters && setIsFilterOpen && (
                        <Badge dot={hasActiveFilters}>
                            <Button
                                icon={<FilterOutlined />}
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                size="large"
                                type={hasActiveFilters ? 'primary' : 'default'}
                                aria-label={hasActiveFilters ? 'Filtros (hay filtros activos)' : 'Filtros'}
                                style={{ flexShrink: 0, width: 48, height: 44, padding: 0 }}
                            />
                        </Badge>
                    )}
                </div>
            </div>
        ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
                {/* Título + badge */}
                {title && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>{title}</Title>
                        {totalCount !== undefined && (
                            <Tag style={{ borderRadius: 10, margin: 0, fontSize: 11 }}>
                                {totalCount} total
                            </Tag>
                        )}
                    </div>
                )}

                {extraActions}

                {onSearchChange && (
                    <Input
                        prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                        placeholder={searchPlaceholder}
                        allowClear
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                        style={{ flex: '1 1 180px', maxWidth: 300 }}
                    />
                )}

                {filters && setIsFilterOpen && (
                    <Popover
                        content={filtersContent}
                        title={<Text strong>Filtros</Text>}
                        trigger="click"
                        open={isFilterOpen}
                        onOpenChange={setIsFilterOpen}
                        placement="bottomRight"
                    >
                        <Button
                            icon={<FilterOutlined />}
                            type={hasActiveFilters ? 'primary' : 'default'}
                        >
                            Filtros
                        </Button>
                    </Popover>
                )}

                {(onRefresh || primaryAction?.canExecute) && <div style={{ flex: 1 }} />}

                {onRefresh && (
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={onRefresh}
                    >
                        Recargar
                    </Button>
                )}

                {primaryAction?.canExecute && (
                    <Button
                        type="primary"
                        icon={primaryAction.icon || <PlusOutlined />}
                        onClick={primaryAction.onClick}
                    >
                        {primaryAction.label}
                    </Button>
                )}
            </div>
        )
    );

    // Encabezado Global Flex-Wrap Responsivo
    const headerContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>

            {/* FILA 1: Título, Subtítulo y Acciones Principales */}
            {!omitHeader && (
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    {/* Sección Título */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: '1 1 auto', minWidth: 0 }}>
                        {icon && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: 48,
                                width: 48,
                                borderRadius: 12,
                                color: token.colorPrimary,
                                fontSize: 24,
                                flexShrink: 0
                            }}>
                                {icon}
                            </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <Space size="small" align="center" style={{ flexWrap: 'wrap' }}>
                                <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
                                    {title}
                                </Title>
                                {totalCount !== undefined && !isMobile && (
                                    <Tag style={{ borderRadius: 10, margin: 0 }}>
                                        {totalCount} total
                                    </Tag>
                                )}
                            </Space>
                            {subtitle && (
                                <div style={{ marginTop: 4 }}>
                                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                        {subtitle}
                                    </Text>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sección Acciones (Recargar + Nuevo) */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
                        {onRefresh && !isMobile && (
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={onRefresh}
                            >
                                Recargar
                            </Button>
                        )}
                        {!isMobile && primaryAction?.canExecute && (
                            <Button
                                type="primary"
                                icon={primaryAction.icon || <PlusOutlined />}
                                onClick={primaryAction.onClick}
                            >
                                {primaryAction.label}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* FILA 2: Búsqueda y Filtros de Vista */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                {onSearchChange && (
                    <Input
                        prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                        placeholder={searchPlaceholder}
                        allowClear
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                        style={{ maxWidth: isMobile ? '100%' : 300, flex: 1 }}
                        size="large"
                    />
                )}

                {filters && isMobile && setIsFilterOpen && (
                    <Badge dot={hasActiveFilters}>
                        <Button
                            icon={<FilterOutlined />}
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            size="large"
                            type={hasActiveFilters ? 'primary' : 'default'}
                            aria-label={hasActiveFilters ? 'Filtros (hay filtros activos)' : 'Filtros'}
                            style={{ width: 48, height: 44, padding: 0 }}
                        />
                    </Badge>
                )}

                {filters && !isMobile && setIsFilterOpen && (
                    <Popover
                        content={filtersContent}
                        title={<Text strong>Filtros</Text>}
                        trigger="click"
                        open={isFilterOpen}
                        onOpenChange={setIsFilterOpen}
                        placement="bottomRight"
                    >
                        <Button
                            icon={<FilterOutlined />}
                            size="large"
                            type={hasActiveFilters ? 'primary' : 'default'}
                        >
                            Filtros
                        </Button>
                    </Popover>
                )}

                {extraActions}

                {showViewToggle && onViewModeChange && viewMode && (
                    <Dropdown
                        menu={{
                            items: viewItems,
                            onClick: (e) => onViewModeChange(e.key as ViewMode),
                            selectedKeys: [viewMode]
                        }}
                        trigger={['click']}
                        placement="bottomRight"
                    >
                        <Button size="large" aria-label="Cambiar vista" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {currentViewItem ? (currentViewItem as any).icon : <AppstoreOutlined />}
                            <DownOutlined style={{ fontSize: 10, color: token.colorTextSecondary }} />
                        </Button>
                    </Dropdown>
                )}

                {/* Primary Action when header is omitted (Desktop) */}
                {omitHeader && !isMobile && primaryAction?.canExecute && (
                    <Button
                        type="primary"
                        icon={primaryAction.icon || <PlusOutlined />}
                        onClick={primaryAction.onClick}
                        size="large"
                        style={{ padding: '0 24px', marginLeft: 'auto' }}
                    >
                        {primaryAction.label}
                    </Button>
                )}
            </div>
        </div>
    );

    return (
        <div
            ref={containerRef}
            className="standard-page-root"
            style={
                isMobile
                    ? { display: 'flex', flexDirection: 'column' }
                    : { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
            }
        >
            {isMobile && onRefresh && (isRefreshing || pullDistance > 0) && (
                <div
                    role="status"
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 8,
                        height: isRefreshing ? 40 : pullDistance,
                        overflow: 'hidden',
                        fontSize: 13,
                        color: token.colorPrimary,
                        flexShrink: 0,
                    }}
                >
                    {isRefreshing ? <LoadingOutlined spin /> : <ReloadOutlined />}
                    {isRefreshing ? 'Actualizando…' : pullDistance >= PULL_THRESHOLD ? 'Suelta para actualizar' : 'Desliza para actualizar'}
                </div>
            )}
            <Card
                className="standard-layout-card no-toolbar"
                title={compact ? compactHeader : headerContent}
                styles={{
                    header: {
                        padding: compact
                            ? '8px 16px'
                            : isMobile ? '16px' : '20px 20px 0px 24px',
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        background: '#fff',
                    },
                    body: {
                        padding: compact ? 0 : isMobile ? '8px' : '16px 24px',
                        paddingBottom: !compact && isMobile && primaryAction?.canExecute ? 80 : undefined,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        background: token.colorBgContainer,
                    }
                }}
            >
                {children}
            </Card>

            {/* Acción principal en móvil: un botón flotante, no una barra de pestañas. */}
            {isMobile && primaryAction?.canExecute && (
                <Button
                    type="primary"
                    size="large"
                    icon={primaryAction.icon || <PlusOutlined />}
                    onClick={primaryAction.onClick}
                    style={{
                        position: 'fixed',
                        right: 16,
                        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
                        zIndex: 100,
                        height: 48,
                        paddingInline: 20,
                        borderRadius: 24,
                        boxShadow: token.boxShadowSecondary,
                    }}
                >
                    {primaryAction.label}
                </Button>
            )}

            {/* Componente Drawer sólo para Móvil */}
            {isMobile && filters && setIsFilterOpen && (
                <Drawer
                    title={<Text strong>Filtros</Text>}
                    placement="bottom"
                    open={isFilterOpen}
                    onClose={() => setIsFilterOpen(false)}
                    styles={{
                        wrapper: { maxHeight: '90vh' },
                        body: { padding: '16px 24px 24px' }
                    }}
                >
                    {filtersContent}
                </Drawer>
            )}
        </div>
    );
};
