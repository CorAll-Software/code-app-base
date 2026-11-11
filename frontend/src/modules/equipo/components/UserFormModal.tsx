import { Modal, Form, Tabs, Flex, message, theme, Steps, Space, Grid, Drawer, Button, Divider, Select, Typography, Col, Row } from 'antd';
import { UserOutlined, SettingOutlined, CheckOutlined, ArrowRightOutlined, SafetyCertificateOutlined, KeyOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { type UserData, usersService } from '../services/users.service';
import type { Permission, Role } from '../../configuracion/services/roles.service';
import { PermissionsTree } from '../../configuracion/components/PermissionsTree';
import { capitalizeWords } from '@src/core/parse';

import { PersonalDataSection } from './user-form/PersonalDataSection';
import { CredentialsSection } from './user-form/CredentialsSection';
import { FotoUploader } from './FotoUploader';

const { Text } = Typography;

const DUMMY_EMAIL_DOMAIN = '@empresa.dummy';

const generateUniqueDummyEmail = (firstName: string, lastName: string, allUsers: UserData[]) => {
    if (!firstName && !lastName) return '';
    const fNames = firstName.toLowerCase().trim().split(/\s+/);
    const lNames = lastName.toLowerCase().trim().split(/\s+/);
    const initial = fNames[0]?.charAt(0) || '';
    const firstLastName = lNames[0] || '';
    const secondInitial = lNames[1]?.charAt(0) || '';
    const base = `${initial}${firstLastName}${secondInitial}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, '');
    if (!base) return '';
    let counter = 1;
    while (counter <= 1000) {
        const candidate = `${base}${counter}${DUMMY_EMAIL_DOMAIN}`;
        if (!allUsers.some(u => u.email === candidate && u.status === true)) return candidate;
        counter++;
    }
    return `${base}${DUMMY_EMAIL_DOMAIN}`;
};

interface UserFormModalProps {
    open: boolean;
    user: UserData | null;
    roles: Role[];
    /** Catálogo de permisos, para los permisos específicos del usuario. */
    permissions: Permission[];
    allUsers: UserData[];
    loading: boolean;
    onCancel: () => void;
    onSave: (values: any) => void;
    onFotoChange?: (userId: number, fotoUrl: string | null) => void;
}

export const UserFormModal = ({
    open, user, roles, permissions, allUsers, loading, onCancel, onSave, onFotoChange
}: UserFormModalProps) => {
    const { token } = theme.useToken();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const [form] = Form.useForm();
    const [activeTab, setActiveTab] = useState('datos');
    const contentRef = useRef<HTMLDivElement>(null);
    const [modalHeight, setModalHeight] = useState<number | 'auto'>('auto');
    const [isAnimating, setIsAnimating] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [localFotoUrl, setLocalFotoUrl] = useState<string | null>(null);

    // Permisos que el usuario ya recibe por los roles elegidos: en el árbol de
    // permisos específicos salen marcados y bloqueados.
    const rolesElegidos: number[] | undefined = Form.useWatch('rol_sistema', { form, preserve: true });
    const permisosPorRol = useMemo(() => {
        const elegidos = new Set(rolesElegidos || []);
        const ids = roles.filter(r => elegidos.has(r.id)).flatMap(r => r.permissions || []);
        return [...new Set(ids)].map(String);
    }, [roles, rolesElegidos]);

    const handleFotoUpload = useCallback(async (file: File): Promise<string | null> => {
        if (!user?.id) return null;
        const result = await usersService.uploadFoto(user.id, file);
        if (result?.foto_url) {
            setLocalFotoUrl(result.foto_url);
            onFotoChange?.(user.id, result.foto_url);
            return result.foto_url;
        }
        return null;
    }, [user?.id, onFotoChange]);

    const handleFotoRemove = useCallback(async () => {
        if (!user?.id) return;
        // Si el borrado falla, la foto sigue existiendo: no la quitamos de la UI.
        const ok = await usersService.deleteFoto(user.id);
        if (!ok) return;
        setLocalFotoUrl(null);
        onFotoChange?.(user.id, null);
    }, [user?.id, onFotoChange]);

    useEffect(() => {
        if (!open) {
            setModalHeight('auto');
            setIsAnimating(false);
            return;
        }
        if (!contentRef.current) return;
        let animTimeout: ReturnType<typeof setTimeout>;
        const observer = new ResizeObserver((entries) => {
            const target = entries[0]?.target as HTMLElement;
            if (target) {
                const newHeight = target.offsetHeight;
                setModalHeight((prevHeight) => {
                    if (typeof prevHeight === 'number' && prevHeight !== newHeight) {
                        setIsAnimating(true);
                        clearTimeout(animTimeout);
                        animTimeout = setTimeout(() => setIsAnimating(false), 350);
                    }
                    return newHeight;
                });
            }
        });
        observer.observe(contentRef.current);
        return () => { observer.disconnect(); clearTimeout(animTimeout); };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        form.resetFields();
        setCurrentStep(0);
        setActiveTab('datos');
        setLocalFotoUrl(user?.foto_url ?? null);
        if (user) {
            const initialValues = { ...user } as any;

            // Nombre compuesto
            if (!initialValues.first_name && initialValues.names) {
                const parts = initialValues.names.trim().split(/\s+/);
                initialValues.first_name = capitalizeWords(parts[0] || '');
                initialValues.last_name = capitalizeWords(parts.slice(1).join(' ') || '');
            }

            if (Array.isArray(initialValues.rol_sistema)) {
                initialValues.rol_sistema = [...new Set(initialValues.rol_sistema)];
            }

            // El árbol trabaja con las claves como texto.
            initialValues.permisos_directos = (user.permisos_directos || []).map(String);

            form.setFieldsValue(initialValues);
        } else {
            form.setFieldsValue({
                enable: true,
                status: true,
            });
        }
    }, [open, user, form]);

    const handleSave = () => {
        form.validateFields()
            .then(values => {
                const processedValues = { ...values };
                processedValues.first_name = capitalizeWords(values.first_name || '');
                processedValues.last_name = capitalizeWords(values.last_name || '');
                processedValues.names = `${processedValues.first_name} ${processedValues.last_name}`.trim();

                if (!user && !processedValues.email) {
                    processedValues.email = generateUniqueDummyEmail(values.first_name || '', values.last_name || '', allUsers);
                }

                processedValues.telefono = processedValues.phone || processedValues.telefono;
                processedValues.phone = processedValues.telefono;

                // Solo viene si se abrió la pestaña; si no, no se toca.
                if (Array.isArray(values.permisos_directos)) {
                    processedValues.permisos_directos = values.permisos_directos.map(Number);
                }

                onSave(processedValues);
            })
            .catch((errorInfo) => {
                const errorFields = errorInfo?.errorFields || [];
                const anyRequired = errorFields.some((f: any) =>
                    f.errors.some((e: string) => e.toLowerCase().includes('requerido') || e.toLowerCase().includes('obligatorio'))
                );
                if (anyRequired) message.error('Por favor completa los campos obligatorios marcados en rojo');
                else if (errorFields.length > 0) message.error('Revise los datos: hay valores duplicados o con formato incorrecto');
            });
    };

    const handleNextStep = () => {
        form.validateFields(['first_name', 'last_name', 'dni', 'phone', 'enable'])
            .then(() => setCurrentStep(1))
            .catch(() => message.error('Por favor completa los campos obligatorios para continuar'));
    };

    const AccesoSection = (
        <>
            <Divider style={{ margin: '8px 0 12px' }}>
                <Space size={6}>
                    <SafetyCertificateOutlined style={{ color: token.colorTextSecondary, fontSize: 12 }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>Acceso al sistema</Text>
                </Space>
            </Divider>
            <Row gutter={16}>
                <Col span={24}>
                    <Form.Item
                        name="rol_sistema"
                        label="Roles asignados"
                        style={{ marginBottom: 8 }}
                    >
                        <Select
                            mode="multiple"
                            placeholder="Seleccione uno o más roles"
                            maxTagCount="responsive"
                            disabled={user?.is_system_user}
                            options={roles.map(r => ({
                                label: r.name,
                                value: r.id,
                            }))}
                        />
                    </Form.Item>
                </Col>
            </Row>
        </>
    );

    const tabItems = [
        {
            key: 'datos',
            label: <Space><UserOutlined />Datos</Space>,
            children: (
                <Flex vertical gap="small" style={{ paddingTop: token.paddingXS }}>
                    {user && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                            <FotoUploader
                                foto_url={localFotoUrl}
                                nombres={user?.first_name || ''}
                                apellidos={user?.last_name || ''}
                                onUpload={handleFotoUpload}
                                onRemove={handleFotoRemove}
                                size={72}
                            />
                        </div>
                    )}
                    {!user ? (
                        <>
                            {!isMobile && (
                                <Steps
                                    current={currentStep}
                                    size="small"
                                    items={[{ title: 'Información básica' }, { title: 'Credenciales' }]}
                                    style={{ marginBottom: token.marginSM }}
                                />
                            )}
                            <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
                                <PersonalDataSection form={form} allUsers={allUsers} userId={user?.id} />
                                {AccesoSection}
                                {isMobile && (
                                    <Button type="primary" block size="large" icon={<ArrowRightOutlined />} onClick={handleNextStep} style={{ marginTop: 16 }}>
                                        Siguiente: Credenciales
                                    </Button>
                                )}
                            </div>
                            <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
                                <CredentialsSection form={form} isEdit={false} allUsers={allUsers} onRegress={() => setCurrentStep(0)} embedded isSuperAdmin={user?.id === 1} />
                            </div>
                        </>
                    ) : (
                        <>
                            <PersonalDataSection form={form} allUsers={allUsers} userId={user?.id} />
                            {AccesoSection}
                        </>
                    )}
                </Flex>
            ),
        },
        ...(user ? [{
            key: 'credenciales',
            label: <Space><SettingOutlined />Credenciales</Space>,
            children: <CredentialsSection form={form} isEdit={true} allUsers={allUsers} userId={user.id} isSuperAdmin={user?.id === 1} />,
        }] : []),
        {
            key: 'permisos',
            label: <Space><KeyOutlined />Permisos específicos</Space>,
            children: user?.is_system_user ? (
                <Text type="secondary">
                    Este usuario tiene un rol de sistema: ya cuenta con todos los permisos.
                </Text>
            ) : (
                <Flex vertical gap="small" style={{ paddingTop: token.paddingXS }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Accesos que se conceden solo a este usuario y se suman a los de sus roles.
                        Los que ya recibe por rol aparecen marcados y no se pueden quitar desde aquí.
                    </Text>
                    <Form.Item name="permisos_directos" noStyle>
                        <PermissionsTree
                            permissions={permissions}
                            lockedKeys={permisosPorRol}
                            lockedLabel="Por rol"
                            height={320}
                        />
                    </Form.Item>
                </Flex>
            ),
        },
    ];

    const handleModalOk = () => {
        if (user) { handleSave(); return; }
        if (currentStep === 0) {
            // En un alta, desde cualquier pestaña: primero faltan las credenciales.
            form.validateFields(['first_name', 'last_name', 'dni', 'phone', 'enable'])
                .then(() => { setCurrentStep(1); setActiveTab('datos'); })
                .catch(() => {
                    setActiveTab('datos');
                    message.error('Por favor completa los campos obligatorios para continuar');
                });
        } else {
            handleSave();
        }
    };

    const isLastStep = user || currentStep === 1;
    const okText = isLastStep ? 'Guardar' : 'Continuar';

    const formContent = (
        <Form
            form={form}
            layout="vertical"
            onValuesChange={(changedValues, allValues) => {
                const isEditing = !!user?.id || !!form.getFieldValue('id');
                if (!isEditing && (changedValues.first_name !== undefined || changedValues.last_name !== undefined)) {
                    const currentEmail = form.getFieldValue('email');
                    const isDummy = !currentEmail || currentEmail.endsWith(DUMMY_EMAIL_DOMAIN);
                    if (isDummy) {
                        const newEmail = generateUniqueDummyEmail(allValues.first_name || '', allValues.last_name || '', allUsers);
                        if (newEmail !== currentEmail) form.setFieldsValue({ email: newEmail });
                    }
                }
            }}
        >
            {isMobile ? (
                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" animated={{ inkBar: true, tabPane: true }} />
            ) : (
                <div style={{ height: modalHeight, transition: 'height 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)', overflow: isAnimating ? 'hidden' : 'visible' }}>
                    <div ref={contentRef}>
                        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} animated={{ inkBar: true, tabPane: true }} />
                    </div>
                </div>
            )}
        </Form>
    );

    if (isMobile) {
        return (
            <Drawer
                title={user ? 'Editar Integrante' : 'Nuevo Integrante'}
                placement="bottom"
                open={open}
                onClose={onCancel}
                styles={{ wrapper: { height: '92vh' }, body: { padding: '8px 12px 80px' } }}
                extra={
                    (user || currentStep === 1) ? (
                        <Button size="large" type="primary" icon={<CheckOutlined />} loading={loading} onClick={handleSave} />
                    ) : undefined
                }
            >
                {formContent}
            </Drawer>
        );
    }

    return (
        <Modal
            title={user ? 'Editar Integrante' : 'Nuevo Integrante'}
            open={open}
            onCancel={onCancel}
            onOk={handleModalOk}
            confirmLoading={loading}
            width={680}
            centered
            okText={okText}
            cancelText="Cancelar"
            destroyOnHidden
        >
            {formContent}
        </Modal>
    );
};
