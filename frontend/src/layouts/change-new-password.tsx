// Example

import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@src/providers/auth-provider';
import { Avatar, Button, Form, Input } from 'antd';
import { useState } from 'react';
// import * as ConfiguracionService from '@src/services/cuenta/configuracion.service';

// no se usa por ahora
export const ChangeNewPassword = () => {

    const auth = useAuth();

    const [form] = Form.useForm();

    const [loading, setLoading] = useState(false);

    // const onFinish = async (values: any) => {
    const onFinish = async () => {
        setLoading(true);
        // const res = await ConfiguracionService.changePassword(values);
        // if (res) {
        //     message.success('Contraseña cambiada correctamente');
        auth.logout();
        // } else {
        //     message.error('No se pudo cambiar la contraseña');
        // }
        setLoading(false);
    };

    return (
        <div className="login-layout">
            <div className="login-layout__content">
                <div className="login-layout__content__header">
                    <Avatar size={64} icon={<UserOutlined />} />
                    <h1>Cambiar contraseña</h1>
                </div>
                <Form
                    form={form}
                    name="normal_login"
                    className="login-form"
                    onFinish={onFinish}
                >
                    <Form.Item
                        name="currentPassword"
                        rules={[{ required: true, message: 'Contraseña actual requerida' }]}
                    >
                        <Input.Password prefix={<LockOutlined className="site-form-item-icon" />} placeholder="Contraseña actual" />
                    </Form.Item>
                    <Form.Item
                        name="newPassword"
                        rules={[{ required: true, message: 'Contraseña nueva requerida' }]}
                    >
                        <Input.Password prefix={<LockOutlined className="site-form-item-icon" />} placeholder="Contraseña nueva" />
                    </Form.Item>
                    <Form.Item
                        name="newPasswordConfirm"
                        rules={[{ required: true, message: 'Confirmar contraseña nueva' }]}
                    >
                        <Input.Password prefix={<LockOutlined className="site-form-item-icon" />} placeholder="Confirmar contraseña nueva" />
                    </Form.Item>
                    <Form.Item>
                        <Button loading={loading} type="primary" htmlType="submit" className="login-form-button">
                            Cambiar contraseña
                        </Button>
                    </Form.Item>
                </Form>
            </div>
        </div>
    )
}