import { LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';
import { useFeedback } from '@src/providers/message.provider';
import { authService } from '@src/services/auth.service';
import { Button, Form, Input, Steps, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from 'antd';

const { useToken } = theme;

const { Title, Text } = Typography;

export const ForgotPasswordPage = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const { message } = useFeedback();

    // Paso 1: Solicitar código de recuperación
    const onFinishEmail = async (values: { email: string }) => {
        setLoading(true);
        try {
            const result = await authService.forgotPassword(values.email);
            if (result) {
                setEmail(values.email);
                setCurrentStep(1);
            }
        } catch (error) {
            // Error managed by service/http
        }
        setLoading(false);
    };

    // Paso 2: Validar código de recuperación
    const onFinishCode = async (values: { recovery_code: string }) => {
        setLoading(true);
        try {
            const result = await authService.validateRecoveryCode(email, values.recovery_code);
            if (result) {
                setRecoveryCode(values.recovery_code);
                setCurrentStep(2);
            }
        } catch (error) {
            // Error managed by service/http
        }
        setLoading(false);
    };

    // Paso 3: Restablecer contraseña
    const onFinishPassword = async (values: { new_password: string; confirm_password: string }) => {
        if (values.new_password !== values.confirm_password) {
            message.error('Las contraseñas no coinciden');
            return;
        }

        setLoading(true);
        try {
            const result = await authService.resetPassword(email, recoveryCode, values.new_password);
            if (result) {
                setCurrentStep(3);
            }
        } catch (error) {
            // Error managed by service/http
        }
        setLoading(false);
    };

    const steps = [
        {
            title: 'Correo',
            description: 'Ingresa tu correo electrónico',
            icon: <MailOutlined />
        },
        {
            title: 'Código',
            description: 'Verifica el código recibido',
            icon: <SafetyOutlined />
        },
        {
            title: 'Nueva contraseña',
            description: 'Establece tu nueva contraseña',
            icon: <LockOutlined />
        }
    ];

    const renderStepContent = () => {
        switch (currentStep) {
            case 0:
                return (
                    <Form onFinish={onFinishEmail} layout="vertical">
                        <Form.Item
                            name="email"
                            label="Correo electrónico"
                            rules={[
                                { required: true, message: 'Por favor ingresa tu correo electrónico' },
                                { type: 'email', message: 'Ingresa un correo válido' }
                            ]}
                        >
                            <Input
                                prefix={<MailOutlined />}
                                placeholder="tu-correo@ejemplo.com"
                                size="large"
                            />
                        </Form.Item>
                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                size="large"
                                block
                            >
                                Enviar código de recuperación
                            </Button>
                        </Form.Item>
                    </Form>
                );

            case 1:
                return (
                    <Form onFinish={onFinishCode} layout="vertical">
                        <Form.Item
                            name="recovery_code"
                            label="Código de recuperación"
                            rules={[
                                { required: true, message: 'Por favor ingresa el código' },
                                { len: 6, message: 'El código debe tener 6 dígitos' }
                            ]}
                        >
                            <Input
                                prefix={<SafetyOutlined />}
                                placeholder="123456"
                                maxLength={6}
                                size="large"
                                className="recovery-code-input"
                            />
                        </Form.Item>
                        <Text type="secondary" className="block text-center mb-3">
                            Enviamos un código de 6 dígitos a {email}
                        </Text>
                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                size="large"
                                block
                            >
                                Validar código
                            </Button>
                        </Form.Item>
                        <Form.Item>
                            <Button
                                type="link"
                                onClick={() => setCurrentStep(0)}
                                size="large"
                                block
                            >
                                Volver atrás
                            </Button>
                        </Form.Item>
                    </Form>
                );

            case 2:
                return (
                    <Form onFinish={onFinishPassword} layout="vertical">
                        <Form.Item
                            name="new_password"
                            label="Nueva contraseña"
                            hasFeedback
                            rules={[
                                { required: true, message: 'Por favor ingresa la nueva contraseña' },
                                { min: 6, message: 'La contraseña debe tener al menos 6 caracteres' },
                                {
                                    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%&*])/,
                                    message: "Debe incluir mayúscula, minúscula, número y carácter especial (!@#$%&*)"
                                }
                            ]}
                        >
                            <Input.Password
                                prefix={<LockOutlined />}
                                placeholder="Nueva contraseña"
                                size="large"
                            />
                        </Form.Item>
                        <Form.Item
                            name="confirm_password"
                            label="Confirmar contraseña"
                            dependencies={['new_password']}
                            hasFeedback
                            rules={[
                                { required: true, message: 'Por favor confirma la contraseña' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('new_password') === value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(new Error('Las contraseñas no coinciden'));
                                    },
                                }),
                            ]}
                        >
                            <Input.Password
                                prefix={<LockOutlined />}
                                placeholder="Confirmar contraseña"
                                size="large"
                            />
                        </Form.Item>
                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={loading}
                                size="large"
                                block
                            >
                                Cambiar contraseña
                            </Button>
                        </Form.Item>
                    </Form>
                ); case 3:
                return (
                    <div className="text-center">
                        <div className="mb-4">
                            <div className="success-icon">✅</div>
                            <Title level={3}>¡Contraseña actualizada!</Title>
                            <Text type="secondary">
                                Tu contraseña ha sido cambiada exitosamente.
                                Ahora puedes iniciar sesión con tu nueva contraseña.
                            </Text>
                        </div>
                        <Link to="/">
                            <Button type="primary" size="large">
                                Ir al inicio de sesión
                            </Button>
                        </Link>
                    </div>
                );

            default:
                return null;
        }
    }; return (
        <>
            {/* {messageContext} */}
            <div className="forgot-password-container" style={{ background: `linear-gradient(135deg, ${useToken().token.colorPrimary} 0%, ${useToken().token.colorTextSecondary} 100%)` }}>
                <div className="forgot-password-card">
                    <div className="text-center mb-20 text-25 text-bold">
                        Recuperar contraseña
                    </div>

                    {currentStep < 3 && (
                        <div className="steps-container">
                            <Steps
                                current={currentStep}
                                items={steps}
                            />
                        </div>
                    )}

                    {renderStepContent()}

                    {currentStep < 3 && (
                        <div className="text-center mt-4">
                            <Link to="/">
                                <Button type="link">
                                    Volver al inicio de sesión
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
