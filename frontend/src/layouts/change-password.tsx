// Example

import { LeftOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@src/providers/auth-provider';
import { Avatar, Button, Form, Input } from 'antd';
import { useState } from 'react';
// import * as ConfiguracionService from '@src/services/cuenta/configuracion.service';

export const ChangePassword = () => {

    const auth = useAuth();

    const [form] = Form.useForm();

    const [loading, setLoading] = useState(false);

    // const onFinish = async (values: any) => {
    const onFinish = async () => {
        setLoading(true);
        // const res = await ConfiguracionService.changePassword(values);
        // if (res) {
        // auth.logout();
        auth.login({ ...auth.user, changePassword: false }, auth.expiredIn);
        // }
        setLoading(false);
    };

    return (
        <div className="login">
            <div className="card">
                <Button shape="circle" icon={<LeftOutlined />} onClick={() => auth.logout()} />
                <div className="w-100 flex-center mb-50">
                    <Avatar size={80} icon={<UserOutlined />} />
                </div>
                <Form
                    form={form}
                    name="normal_login"
                    className="login-form"
                    onFinish={onFinish}
                >
                    <Form.Item
                        name="newPassword"
                        rules={[{ required: true, message: 'Contraseña nueva requerida' }]}
                    >
                        <Input.Password prefix={<LockOutlined className="site-form-item-icon" />} placeholder="Contraseña nueva" />
                    </Form.Item>
                    <Form.Item
                        name="newPasswordConfirm"
                        rules={[{ required: true, message: 'Confirmar contraseña nueva' },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('newPassword') === value) {
                                    return Promise.resolve();
                                }
                                return Promise.reject(new Error('Las contraseñas no coinciden'));
                            },
                        }),]}
                    >
                        <Input.Password prefix={<LockOutlined className="site-form-item-icon" />} placeholder="Confirmar contraseña nueva" />
                    </Form.Item>
                    <Form.Item>
                        <Button loading={loading} type="primary" htmlType="submit" className="w-100">
                            Cambiar contraseña
                        </Button>
                    </Form.Item>
                </Form>
            </div>
            <div className="animation-area">
                <ul className="box-area">
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                    <img src='/svg/isotipo-sin-fondo/co-blanco.svg' alt='' />
                </ul>
            </div>

        </div>
    )
}