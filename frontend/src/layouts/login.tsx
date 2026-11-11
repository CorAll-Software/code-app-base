import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@src/providers/auth-provider';
import { useFeedback } from '@src/providers/message.provider';
import { Button, Col, Form, Input, Row } from 'antd';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { storeSession } from '@src/core/http';
import { CAPTCHA_FAILED_MSG, withCaptcha } from '@core/captcha';
import { CapCaptcha, type CapCaptchaHandle } from '@components/CapCaptcha';

export const Login = () => {

    const auth = useAuth()
    const [loading, setLoading] = useState(false)
    const captchaRef = useRef<CapCaptchaHandle>(null)
    const submitRef = useRef<any>(null)
    const { message } = useFeedback();

    // Ant Design solo llama a onFinish cuando el formulario ya validó, así que
    // el reto de Cap se resuelve aquí: no se gasta una prueba-de-trabajo en un
    // formulario con errores.
    const onFinish = async (e) => {
        const { email, password } = e
        if (!email || !password) { return }

        setLoading(true)

        let capToken: string
        try {
            capToken = await captchaRef.current.solve()
        } catch (err) {
            console.error(err)
            message.error(CAPTCHA_FAILED_MSG)
            setLoading(false)
            return
        }

        fetch(`${window._routeApi}auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withCaptcha({ email, password }, capToken))
        })
            .then(async res => {
                const contentType = res.headers.get('Content-Type').split(';')[0]

                if (contentType === 'text/plain') {
                    message.error(await res.text())
                } else if (contentType === 'application/json') {
                    const json = await res.json()
                    if (json.message) {
                        message.error(json.message)
                    } else if (json.token) {
                        storeSession(json.token, json.refreshToken)
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
        <Row gutter={[16, 16]} style={{ height: '100vh', margin: 0 }}>
                <Col xs={0} md={14} xl={16}>
                    <div className='flex-center' style={{ height: '100vh' }}>
                        <img
                            style={{ width: '100%', maxWidth: '700px' }}
                            src='/svg/enterprise.svg'
                            alt='' />
                    </div>
                </Col>
                <Col xs={24} md={10} xl={8} className='flex flex-column justify-center align-center' style={{ padding: '0 20px' }}>
                    <div style={{ width: '100%', maxWidth: 360 }}>
                    <header>
                        <h1 style={{ fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '0 0 24px' }}>Iniciar sesión</h1>
                    </header>
                    <Form
                        name="normal_login"
                        layout="vertical"
                        requiredMark={false}
                        initialValues={{ remember: true }}
                        onFinish={onFinish}
                    >
                        <Form.Item
                            name="email"
                            label="Correo electrónico"
                            rules={[
                                { required: true, message: 'Ingresa tu correo electrónico' },
                                { 
                                    pattern: /^[a-zA-Z0-9._%+-åäöÅÄÖñÑáéíóúÁÉÍÓÚüÜ]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 
                                    message: 'Ingresa un correo válido, como nombre@empresa.com'
                                }
                            ]}
                        >
                            <Input
                                prefix={<UserOutlined className="site-form-item-icon" />}
                                placeholder="nombre@empresa.com"
                                size="large"
                                inputMode="email"
                                autoComplete="username"
                                autoCapitalize="none"
                            />
                        </Form.Item>
                        <Form.Item
                            name="password"
                            label="Contraseña"
                            rules={[{ required: true, message: 'Ingresa tu contraseña' }]}
                        >
                            <Input.Password
                                prefix={<LockOutlined className="site-form-item-icon" />}
                                size="large"
                                autoComplete="current-password"
                            />
                        </Form.Item>
                        <CapCaptcha ref={captchaRef} anchorRef={submitRef} />
                        <Button ref={submitRef} type="primary" htmlType="submit" size="large" block className="my-10" loading={loading}>
                            Iniciar sesión
                        </Button>
                        <div className="text-center mt-10">
                            <Link to="/forgot-password" className="login-form-forgot">
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>
                    </Form>
                    <footer className="text-center" style={{ marginTop: 32, fontSize: 12, color: 'rgba(0, 0, 0, 0.6)' }}>
                        <p>© {new Date().getFullYear()} Todos los derechos reservados</p>
                    </footer>
                    </div>
                </Col>
            </Row>
    )
}