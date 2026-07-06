import { LockOutlined, SaveOutlined, UserOutlined } from '@ant-design/icons';
import { getInitials } from '@src/core/parse';
import { getColorString } from '@src/core/color';
// import { TipoDocumento } from '@src/core/types';
import { useAuth } from '@src/providers/auth-provider';
import { authService } from '@src/services/auth.service';
import { Avatar, Button, Card, Col, Form, Input, Row, Tabs } from 'antd';
import { useState, useEffect } from 'react';

// const tiposDocumento: { label: string; value: TipoDocumento }[] = [
//     { label: 'DNI', value: 'DNI' },
//     { label: 'RUC', value: 'RUC' },
// ];


export const ProfilePage = () => {
    const auth = useAuth();
    const [formData] = Form.useForm();
    const [formPassword] = Form.useForm();
    const [loading, setLoading] = useState(false);
    
    // Sync form with auth session data
    useEffect(() => {
        if (auth.user) {
            formData.setFieldsValue({
                names: auth.user.names,
                email: auth.user.email,
                telefono: auth.user.telefono,
                dni: auth.user.dni,
            });
        }
    }, [auth.user, formData]);

    const handleUpdateProfile = async (values: any) => {
        setLoading(true);
        const res = await authService.updateProfile({
            id: auth.user.id,
            ...values
        });
        if (res) {
            auth.login({ ...auth.user, ...values }, auth.expiredIn);
        }
        setLoading(false);
    };

    const handleChangePassword = async (values: any) => {
        setLoading(true);
        const res = await authService.updatePassword({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword
        });
        if (res) {
            formPassword.resetFields();
        }
        setLoading(false);
    };

    const items = [
        {
            key: '1',
            label: 'Datos Personales',
            children: (
                <Form
                    form={formData}
                    layout="vertical"
                    onFinish={handleUpdateProfile}
                    initialValues={{
                        names: auth.user?.names,
                        email: auth.user?.email,
                        telefono: auth.user?.telefono,
                        dni: auth.user?.dni,
                    }}
                >
                    <Form.Item
                        name="names"
                        label="Nombre completo"
                        rules={[{ required: true, message: 'Campo requerido' }]}
                    >
                        <Input prefix={<UserOutlined />} />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label="Correo electrónico"
                        rules={[
                            { required: true, message: 'Campo requerido' },
                            auth?.user?.id !== 1 && { type: 'email', message: 'Correo inválido' }
                        ]}
                    >
                        <Input prefix={<UserOutlined />} />
                    </Form.Item>
                    <Form.Item
                        name="telefono"
                        label="Teléfono"
                    >
                        <Input prefix={<UserOutlined />} />
                    </Form.Item>
{/*                     
                    <Form.Item name="tipo_documento" label="Tipo Documento"
                        rules={[{ required: true, message: "Seleccione el tipo" }]}>
                        <Select options={tiposDocumento} placeholder="Seleccione tipo" />
                    </Form.Item>
 */}
                    <Form.Item
                        name="dni"
                        label="Número de Documento (DNI)"
                    >
                        <Input prefix={<UserOutlined />} />
                    </Form.Item>
                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            icon={<SaveOutlined />}
                        >
                            Guardar cambios
                        </Button>
                    </Form.Item>
                </Form>
            )
        },
        {
            key: '2',
            label: 'Cambiar Contraseña',
            children: (
                <Form
                    form={formPassword}
                    layout="vertical"
                    onFinish={handleChangePassword}
                >
                    <Form.Item
                        name="currentPassword"
                        label="Contraseña actual"
                        rules={[{ required: true, message: 'Campo requerido' }]}
                    >
                        <Input.Password prefix={<LockOutlined />} />
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
                        <Input.Password prefix={<LockOutlined />} />
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
                                    if (!value || getFieldValue('newPassword') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('Las contraseñas no coinciden'));
                                },
                            }),
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} />
                    </Form.Item>
                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            icon={<LockOutlined />}
                        >
                            Cambiar contraseña
                        </Button>
                    </Form.Item>
                </Form>
            )
        }
    ];

    return (
        <Card title="Mi Perfil">
            <Row gutter={[24, 24]}>
                <Col xs={24} sm={24} md={8} lg={6}>
                    <div style={{ textAlign: 'center' }}>
                        <Avatar 
                            size={100} 
                            style={{ 
                                backgroundColor: getColorString(auth.user?.names || ''),
                                border: '4px solid white',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                fontSize: '40px',
                                fontWeight: 600
                            }}
                        >
                            {getInitials(auth.user?.names || '')}
                        </Avatar>
                        <h2 style={{ marginTop: 16 }}>{auth.user?.names}</h2>
                        <p>{auth.user?.email}</p>
                    </div>
                </Col>
                <Col xs={24} sm={24} md={16} lg={18}>
                    <Tabs items={items} />
                </Col>
            </Row>
        </Card>
    );
};