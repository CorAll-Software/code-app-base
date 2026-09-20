import {
    DesktopOutlined,
    LockOutlined,
    LogoutOutlined,
    MailOutlined,
    MobileOutlined,
    PhoneOutlined,
    SaveOutlined,
    UserOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import { BRAND } from '@src/core/color';
import { useAuth } from '@src/providers/auth-provider';
import { useProfileDrawerStore } from '@src/store/profile-drawer.store';
import { authService } from '@src/services/auth.service';
import { sessionsService, type UserSessionInfo } from '@src/services/sessions.service';
import { FotoUploader } from '@src/modules/equipo/components/FotoUploader';
import { portalPhotoService } from '@src/services/profile-photo.service';
import { Button, Divider, Drawer, Empty, Form, Input, List, Popconfirm, Skeleton, Tag, Tabs, Typography, notification } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';

const { Text } = Typography;

/* ─── Header del drawer ───────────────────────────────────────── */
const DrawerHeader = () => {
    const auth = useAuth();
    const names   = auth.user?.names ?? '';
    const email   = auth.user?.email ?? '';
    const roles   = auth.user?.roles ?? [];
    const fotoUrl = auth.user?.avatar ?? null;

    const handleUpload = async (file: File): Promise<string | null> => {
        const res = await portalPhotoService.uploadFoto(file);
        if (res?.foto_url) {
            auth.login({ ...auth.user, avatar: res.foto_url }, auth.expiredIn);
            return res.foto_url;
        }
        return null;
    };

    const handleRemove = async () => {
        // Solo limpiamos el avatar en pantalla si el backend confirmó el borrado.
        const ok = await portalPhotoService.deleteFoto();
        if (ok) auth.login({ ...auth.user, avatar: null }, auth.expiredIn);
    };

    return (
        <div style={{ textAlign: 'center', padding: '0 0 8px' }}>
            {/* Banner gradiente */}
            <div
                style={{
                    background: BRAND.gradient,
                    borderRadius: 10,
                    height: 72,
                    marginBottom: -36,
                    position: 'relative',
                }}
            />

            {/* Avatar / uploader flotante */}
            <div style={{ position: 'relative', zIndex: 1, display: 'inline-block' }}>
                <FotoUploader
                    foto_url={fotoUrl}
                    nombres={names}
                    apellidos=""
                    onUpload={handleUpload}
                    onRemove={handleRemove}
                    size={72}
                />
            </div>

            {/* Nombre */}
            <div style={{ marginTop: 10, fontWeight: 700, fontSize: 17, color: BRAND.text, lineHeight: 1.3 }}>
                {names}
            </div>

            {/* Email */}
            <Text type="secondary" style={{ fontSize: 12 }}>
                {email}
            </Text>

            {/* Roles */}
            {roles?.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {roles.map((r) => (
                        <Tag
                            key={r.id}
                            icon={<SafetyCertificateOutlined />}
                            color="purple"
                            style={{ borderRadius: 20, fontSize: 11 }}
                        >
                            {r.name}
                        </Tag>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ─── Tab: Datos Personales ───────────────────────────────────── */
const PersonalDataTab = ({ auth, form, notificationApi }: { auth: any; form: any; notificationApi: any }) => {
    const [loading, setLoading] = useState(false);

    const handleFinish = async (values: any) => {
        setLoading(true);
        try {
            const res = await authService.updateProfile({ id: auth.user.id, ...values }, { hideNotification: true });
            if (res) {
                const names = `${values.first_name} ${values.last_name}`.trim();
                auth.login({ ...auth.user, ...values, names }, auth.expiredIn);
                window.messageApi?.success('Perfil actualizado correctamente');
            }
        } catch (error: any) {
            console.error("Profile update error:", error);
            const errorMsg = error?.message || error?.error || String(error);

            // 1. Caso: Super Administrador Protegido
            if (errorMsg.includes('BLINDADO')) {
                notificationApi.warning({
                    message: 'Acceso Protegido',
                    description: 'Esta cuenta es de nivel Super Administrador y tiene restricciones de seguridad. El correo electrónico no puede ser modificado.',
                    placement: 'topRight',
                    duration: 6
                });
                return;
            }

            // 2. Caso: Correo ya registrado por otro usuario
            const isEmailError =
                errorMsg.toLowerCase().includes('email') ||
                errorMsg.toLowerCase().includes('correo') ||
                errorMsg.toLowerCase().includes('unique') ||
                errorMsg.toLowerCase().includes('duplicado') ||
                errorMsg.toLowerCase().includes('duplicate') ||
                errorMsg.toLowerCase().includes('ya está siendo utilizado');

            if (isEmailError) {
                notificationApi.error({
                    message: 'Correo no disponible',
                    description: (
                        <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                            <p>
                                El correo <Text strong style={{ color: BRAND.primary }}>{values.email}</Text> ya está siendo utilizado por otro usuario en la plataforma.
                            </p>
                            <Divider style={{ margin: '12px 0' }} />
                            <p><b>¿Cómo puedes solucionarlo?</b></p>
                            <ul style={{ paddingLeft: '18px', margin: '8px 0' }}>
                                <li>Asegúrate de no tener un error de escritura.</li>
                                <li>Utiliza una cuenta de correo diferente (personal o corporativa).</li>
                                <li>Si crees que este correo te pertenece y no puedes acceder, contacta con el administrador del sistema.</li>
                            </ul>
                        </div>
                    ),
                    duration: 8,
                    style: {
                        borderRadius: '12px',
                        borderLeft: `5px solid #cf1322`,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    }
                });
            } else {
                window.messageApi?.error(errorMsg || 'Error al actualizar el perfil');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            initialValues={{
                first_name: auth.user?.first_name || auth.user?.names?.split(' ')[0] || '',
                last_name: auth.user?.last_name || auth.user?.names?.split(' ').slice(1).join(' ') || '',
                email: auth.user?.email,
                telefono: auth.user?.telefono,
            }}
        >
            <Form.Item
                name="first_name"
                label="Nombre"
                rules={[{ required: true, message: 'Campo requerido' }]}
            >
                <Input
                    maxLength={50}
                    prefix={<UserOutlined style={{ color: BRAND.primary }} />}
                    placeholder="Tu nombre"
                    size="large"
                />
            </Form.Item>

            <Form.Item
                name="last_name"
                label="Apellidos"
                rules={[{ required: true, message: 'Campo requerido' }]}
            >
                <Input
                    maxLength={50}
                    prefix={<UserOutlined style={{ color: BRAND.primary }} />}
                    placeholder="Tus apellidos"
                    size="large"
                />
            </Form.Item>

            <Form.Item
                name="email"
                label="Correo electrónico"
                rules={[
                    { required: true, message: 'Campo requerido' },
                    auth?.user?.id !== 1 && { type: 'email', message: 'Correo inválido' },
                ]}
            >
                <Input
                    prefix={<MailOutlined style={{ color: BRAND.primary }} />}
                    placeholder="correo@ejemplo.com"
                    size="large"
                    disabled={auth?.user?.id === 1}
                />
            </Form.Item>

            <Form.Item
                name="telefono"
                label="Teléfono"
                rules={[
                    { pattern: /^\d{9}$/, message: 'El teléfono debe tener exactamente 9 dígitos' }
                ]}
                normalize={(value) => value.replace(/\D/g, '')}
            >
                <Input
                    prefix={<PhoneOutlined style={{ color: BRAND.primary }} />}
                    placeholder="999999999"
                    size="large"
                    maxLength={9}
                />
            </Form.Item>

            <Divider style={{ margin: '8px 0 16px' }} />

            <Form.Item style={{ marginBottom: 0 }}>
                <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    icon={<SaveOutlined />}
                    size="large"
                    block
                    style={{
                        background: BRAND.gradient,
                        border: 'none',
                        borderRadius: 8,
                        height: 44,
                        fontWeight: 600,
                    }}
                >
                    Guardar cambios
                </Button>
            </Form.Item>
        </Form>
    );
};

/* ─── Tab: Cambiar Contraseña ─────────────────────────────────── */
const ChangePasswordTab = ({ form }: { form: any }) => {
    const [loading, setLoading] = useState(false);

    const handleFinish = async (values: any) => {
        setLoading(true);
        const res = await authService.updatePassword({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
        });
        if (res) form.resetFields();
        setLoading(false);
    };

    return (
        <Form form={form} layout="vertical" onFinish={handleFinish}>
            <Form.Item
                name="currentPassword"
                label="Contraseña actual"
                rules={[{ required: true, message: 'Campo requerido' }]}
            >
                <Input.Password
                    prefix={<LockOutlined />}
                    size="large"
                    placeholder="Contraseña actual"
                />
            </Form.Item>

            <Form.Item
                name="newPassword"
                label="Nueva contraseña"
                hasFeedback
                rules={[
                    { required: true, message: 'Ingrese la nueva contraseña' },
                    { min: 6, message: 'Mínimo 6 caracteres' },
                    {
                        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%&*])/,
                        message: "Debe incluir mayúscula, minúscula, número y carácter especial (!@#$%&*)"
                    }
                ]}
            >
                <Input.Password
                    prefix={<LockOutlined />}
                    size="large"
                    placeholder="Nueva contraseña"
                />
            </Form.Item>
            <Form.Item
                name="confirmPassword"
                label="Confirmar contraseña"
                dependencies={['newPassword']}
                hasFeedback
                rules={[
                    { required: true, message: 'Confirme la contraseña' },
                    ({ getFieldValue }) => ({
                        validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                            return Promise.reject(new Error('Las contraseñas no coinciden'));
                        },
                    }),
                ]}
            >
                <Input.Password
                    prefix={<LockOutlined />}
                    size="large"
                    placeholder="Repite la nueva contraseña"
                />
            </Form.Item>

            <Divider />

            <Form.Item style={{ marginBottom: 0 }}>
                <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    icon={<LockOutlined />}
                    size="large"
                    block
                >
                    Actualizar contraseña
                </Button>
            </Form.Item>
        </Form>
    );
};

/* ─── Tab: Sesiones activas ───────────────────────────────────── */
const isMobileDevice = (device?: string | null) => /Android|iOS/i.test(device || '');

const SessionsTab = () => {
    const auth = useAuth();
    const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
    const [loading, setLoading] = useState(true);
    /** id de la sesión que se está cerrando, o 'others' para el cierre masivo. */
    const [closing, setClosing] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setSessions(await sessionsService.list());
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const closeOne = async (id: string) => {
        setClosing(id);
        const ok = await sessionsService.revoke(id);
        setClosing(null);

        if (!ok) return; // El toast de error ya salió; no tocamos la lista.

        // Cerrar la sesión actual equivale a cerrar sesión aquí: sin esto el
        // cliente seguiría con sus tokens hasta el siguiente 401.
        if (sessions.find(s => s.id === id)?.current) return auth.logout();

        load();
    };

    const closeOthers = async () => {
        setClosing('others');
        const ok = await sessionsService.revokeOthers();
        setClosing(null);
        if (ok) load();
    };

    if (loading) return <Skeleton active paragraph={{ rows: 4 }} />;

    // Un usuario autenticado siempre tiene al menos ESTA sesión, así que una
    // lista vacía solo puede significar que la carga falló.
    if (!sessions.length) {
        return (
            <Empty
                description="No se pudieron cargar tus sesiones"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
                <Button onClick={load}>Reintentar</Button>
            </Empty>
        );
    }

    const others = sessions.filter((s) => !s.current);

    return (
        <>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                Estos son los dispositivos con tu sesión abierta. Si no reconoces alguno,
                ciérralo y cambia tu contraseña.
            </Text>

            <List
                itemLayout="horizontal"
                dataSource={sessions}
                renderItem={(session) => (
                    <List.Item
                        actions={[
                            <Popconfirm
                                key="close"
                                title="¿Cerrar esta sesión?"
                                description={
                                    session.current
                                        ? 'Es el dispositivo que estás usando: se cerrará tu sesión aquí.'
                                        : 'Ese dispositivo tendrá que iniciar sesión de nuevo.'
                                }
                                okText="Cerrar"
                                cancelText="Cancelar"
                                onConfirm={() => closeOne(session.id)}
                            >
                                <Button
                                    danger
                                    type="text"
                                    size="small"
                                    icon={<LogoutOutlined />}
                                    loading={closing === session.id}
                                />
                            </Popconfirm>,
                        ]}
                    >
                        <List.Item.Meta
                            avatar={
                                isMobileDevice(session.device)
                                    ? <MobileOutlined style={{ fontSize: 20, color: BRAND.primary }} />
                                    : <DesktopOutlined style={{ fontSize: 20, color: BRAND.primary }} />
                            }
                            title={
                                <span style={{ fontSize: 13 }}>
                                    {session.device || 'Dispositivo desconocido'}
                                    {session.current && (
                                        <Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>
                                            Este dispositivo
                                        </Tag>
                                    )}
                                </span>
                            }
                            description={
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {session.ip_address && session.ip_address !== 'unknown'
                                        ? `IP ${session.ip_address} · `
                                        : ''}
                                    Activa {dayjs.unix(session.last_used_at ?? session.date_cr).fromNow()}
                                </Text>
                            }
                        />
                    </List.Item>
                )}
            />

            {others.length > 0 && (
                <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Popconfirm
                        title="¿Cerrar las demás sesiones?"
                        description={`Se cerrarán ${others.length} sesión${others.length > 1 ? 'es' : ''} en otros dispositivos.`}
                        okText="Cerrar todas"
                        cancelText="Cancelar"
                        onConfirm={closeOthers}
                    >
                        <Button danger block icon={<LogoutOutlined />} loading={closing === 'others'}>
                            Cerrar las demás sesiones
                        </Button>
                    </Popconfirm>
                </>
            )}
        </>
    );
};

/* ─── Componente principal ────────────────────────────────────── */
export const ProfileDrawer = () => {
    const { open, closeDrawer } = useProfileDrawerStore();
    const auth = useAuth();
    const [formData] = Form.useForm();
    const [formPassword] = Form.useForm();
    const [notificationApi, contextHolder] = notification.useNotification();

    const items = [
        {
            key: '1',
            label: (
                <span>
                    <UserOutlined style={{ marginRight: 6 }} />
                    Perfil
                </span>
            ),
            children: (
                <PersonalDataTab
                    auth={auth}
                    form={formData}
                    notificationApi={notificationApi}
                />
            ),
        },
        {
            key: '2',
            label: (
                <span>
                    <LockOutlined style={{ marginRight: 6 }} />
                    Contraseña
                </span>
            ),
            children: (
                <ChangePasswordTab form={formPassword} />
            ),
        },
        {
            key: '3',
            label: (
                <span>
                    <DesktopOutlined style={{ marginRight: 6 }} />
                    Sesiones
                </span>
            ),
            children: (
                <SessionsTab />
            ),
        },
    ];

    return (
        <Drawer
            open={open}
            onClose={closeDrawer}
            size="default"
            destroyOnHidden
            title={null}
            styles={{
                header: { display: 'none' },
                body: { padding: '20px 24px 24px' },
            }}
        >
            {contextHolder}
            <DrawerHeader />

            <Divider style={{ margin: '18px 0 12px' }} />

            <Tabs
                items={items}
                centered
                tabBarStyle={{ marginBottom: 16 }}
            />
        </Drawer>
    );
};
