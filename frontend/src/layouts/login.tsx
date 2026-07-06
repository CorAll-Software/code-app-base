import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@src/providers/auth-provider';
import { useFeedback } from '@src/providers/message.provider';
import { Button, Col, Form, Input, Row } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LOCAL_STORAGE_KEYS } from '@src/core/constants';

export const Login = () => {

    const auth = useAuth()
    const [loading, setLoading] = useState(false)
    const { message } = useFeedback();

    const onFinish = async (e) => {
        const { email, password } = e
        if (!email || !password) { return }
        setLoading(true)
        fetch(window._routeApi + 'auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })
            .then(async res => {
                const contentType = res.headers.get('Content-Type').split(';')[0]

                if (contentType === 'text/plain') {
                    message.error(await res.text())
                } else if (contentType == 'application/json') {
                    const json = await res.json()
                    if (json.message) {
                        message.error(json.message)
                    } else if (json.token) {
                        localStorage.setItem(LOCAL_STORAGE_KEYS.TOKEN, json.token)
                        auth.login(json.user, json.expiresIn)
                    }
                }

                setLoading(false)
            })
            .catch(err => {
                console.log(err.message)
                message.error('Error al iniciar sesión')
                setLoading(false)
            })

    }

    return (
        <>
            <Row gutter={[16, 16]} style={{ height: '100vh', margin: 0 }}>
                <Col xs={0} md={14} xl={18}>
                    <div className='flex-center' style={{ height: '100vh' }}>
                        <img
                            style={{ width: '100%', maxWidth: '700px' }}
                            src='/svg/enterprise.svg' />
                    </div>
                </Col>
                <Col xs={24} md={10} xl={6} className='flex flex-column justify-center' style={{ padding: '0 20px' }}>
                    <header className="flex-center">
                        <h3 className='text-25'> Bienvenido! </h3>
                    </header>
                    <Form
                        name="normal_login"
                        initialValues={{ remember: true }}
                        onFinish={onFinish}
                    >
                        <Form.Item
                            name="email"
                            rules={[
                                { required: true, message: '¡Por favor ingrese su email!' },
                                { 
                                    pattern: /^[a-zA-Z0-9._%+-åäöÅÄÖñÑáéíóúÁÉÍÓÚüÜ]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 
                                    message: '¡Por favor ingrese un email válido!' 
                                }
                            ]}
                        >
                            <Input prefix={<UserOutlined className="site-form-item-icon" />} placeholder="Email" />
                        </Form.Item>
                        <Form.Item
                            name="password"
                            rules={[{ required: true, message: '¡Por favor ingrese su contraseña!' }]}
                        >
                            <Input.Password
                                prefix={<LockOutlined className="site-form-item-icon" />}
                                type="password"
                                placeholder="Contraseña"
                            />
                        </Form.Item>
                        <Button type="primary" htmlType="submit" className="button-login w-100 my-10" loading={loading}>
                            Iniciar sesión
                        </Button>
                        <div className="text-center mt-10">
                            <Link to="/forgot-password" className="login-form-forgot">
                                ¿Te has olvidado la contraseña?
                            </Link>
                        </div>
                    </Form>
                    <footer className="footer-login">
                        <p>© {new Date().getFullYear()} Todos los derechos reservados</p>
                    </footer>
                </Col>
            </Row>

        </>
    )
}