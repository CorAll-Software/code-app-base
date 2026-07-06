import { Form, Input, Button, Tooltip, Row, Col, Flex, Card, Space, message, theme, FormInstance } from 'antd';
import { ReloadOutlined, SettingOutlined, CopyOutlined } from '@ant-design/icons';

import { UserData } from '../../services/users.service';

interface CredentialsSectionProps {
    form: FormInstance;
    isEdit: boolean;
    allUsers?: UserData[];
    userId?: number;
    onRegress?: () => void;
    embedded?: boolean;
    isSuperAdmin?: boolean;
}

export const CredentialsSection = ({
    form,
    isEdit,
    allUsers = [],
    userId,
    onRegress,
    embedded = false,
    isSuperAdmin = false
}: CredentialsSectionProps) => {
    const { token } = theme.useToken();

    const generateRandomPassword = () => {
        const length = 10;
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
        const requiredChars = [
            "abcdefghijklmnopqrstuvwxyz",
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "0123456789",
            "!@#$%&*"
        ];

        let password = "";
        requiredChars.forEach(charSet => {
            password += charSet.charAt(Math.floor(Math.random() * charSet.length));
        });

        for (let i = password.length; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }

        const shuffled = password.split('').sort(() => Math.random() - 0.5).join('');
        form.setFieldsValue({ 
            password: shuffled,
            confirm: shuffled
        });
        form.validateFields(['password', 'confirm']);
    };

    const copyCredentials = () => {
        const { email, password } = form.getFieldsValue(['email', 'password']);

        if (!email) {
            message.warning('Debes tener al menos el email listo');
            return;
        }

        if (!isEdit && !password) {
            message.warning('Debes generar o escribir una contraseña para copiar las credenciales');
            return;
        }

        const passwordText = password ? `Contraseña: ${password}` : 'Contraseña: (Grabada previamente)';
        const content = `Email: ${email}\n${passwordText}`;

        navigator.clipboard.writeText(content)
            .then(() => {
                message.success('Credenciales copiadas al portapapeles');
            })
            .catch(() => {
                message.error('Error al copiar las credenciales');
            });
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <Card
                size="small"
                title={embedded ? <Space><SettingOutlined /> Credenciales de Acceso</Space> : null}
                styles={embedded ? { body: { padding: '16px' } } : { body: { padding: '8px 0' } }}
                style={embedded ? { background: token.colorFillAlter, border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadiusLG } : { border: 'none', background: 'transparent' }}
            >
                <Flex vertical gap="middle">
                    <Row gutter={16}>
                        <Col span={isEdit ? 12 : 24}>
                            <Form.Item
                                name="email"
                                label="Correo Electrónico"
                                rules={[
                                    { required: true, message: 'Requerido' },
                                    { max: 60, message: 'Máximo 60 caracteres' },
                                    { 
                                        pattern: /^[a-zA-Z0-9._%+-åäöÅÄÖñÑáéíóúÁÉÍÓÚüÜ]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 
                                        message: '¡Por favor ingrese un email válido!' 
                                    },
                                    {
                                        validator: async (_, value) => {
                                            if (!value) return Promise.resolve();
                                            const normalizedValue = value.toLowerCase().trim();
                                            const duplicate = allUsers.find(u =>
                                                u.email?.toLowerCase().trim() === normalizedValue &&
                                                u.status === true &&
                                                (!userId || u.id !== userId)
                                            );

                                            if (duplicate) {
                                                return Promise.reject(new Error('Ya existe un usuario con este correo electrónico'));
                                            }
                                            return Promise.resolve();
                                        }
                                    }
                                ]}
                                style={{ marginBottom: '12px' }}
                            >
                                <Input placeholder="usuario@empresa.com" disabled={isSuperAdmin} maxLength={60} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                label={isEdit ? "Contraseña (Protegida)" : "Contraseña de Acceso"}
                                required={!isEdit}
                                style={{ marginBottom: '12px' }}
                            >
                                <Space.Compact block>
                                    <Form.Item
                                        name="password"
                                        noStyle
                                        rules={[
                                            { required: !isEdit, message: 'Ingrese la contraseña de acceso' },
                                            { min: 6, message: 'Mínimo 6 caracteres' },
                                            {
                                                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%&*])/,
                                                message: "Debe incluir mayúscula, minúscula, número y carácter especial (!@#$%&*)"
                                            }
                                        ]}
                                    >
                                        <Input.Password
                                            placeholder={isEdit ? "********" : "Genera una contraseña segura"}
                                            autoComplete='new-password'
                                            disabled={isEdit}
                                            visibilityToggle={!isEdit}
                                        />
                                    </Form.Item>
                                    <Tooltip title={isEdit ? "Use seguridad en la tabla para cambiar" : "Generar clave aleatoria"}>
                                        <Button
                                            icon={<ReloadOutlined />}
                                            onClick={generateRandomPassword}
                                            disabled={isEdit}
                                        />
                                    </Tooltip>
                                </Space.Compact>
                            </Form.Item>
                        </Col>

                        {!isEdit && (
                            <Col span={12}>
                                <Form.Item
                                    name="confirm"
                                    label="Confirmar Contraseña"
                                    dependencies={['password']}
                                    hasFeedback
                                    rules={[
                                        { required: true, message: 'Confirme la contraseña' },
                                        ({ getFieldValue }) => ({
                                            validator(_, value) {
                                                if (!value || getFieldValue('password') === value) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('Las contraseñas no coinciden'));
                                            },
                                        }),
                                    ]}
                                >
                                    <Input.Password placeholder="Repita la nueva contraseña" />
                                </Form.Item>
                            </Col>
                        )}
                    </Row>

                    {!isEdit && (
                        <>
                            <Button
                                type="primary"
                                ghost
                                icon={<CopyOutlined />}
                                onClick={copyCredentials}
                                block
                            >
                                Copiar Credenciales
                            </Button>
                        </>
                    )}

                    {embedded && (
                        <Button
                            block
                            onClick={onRegress}
                        >
                            Regresar a Datos Personales
                        </Button>
                    )}
                </Flex>
            </Card>
        </div>
    );
};
