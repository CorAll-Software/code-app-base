import { Modal, Form, Input, theme, Grid, Drawer, Button } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { useEffect } from 'react';

interface ChangePasswordModalProps {
    open: boolean;
    userId: number | null;
    onCancel: () => void;
    onSave: (values: any) => Promise<void>;
    loading: boolean;
}

export const ChangePasswordModal = ({ open, userId, onCancel, onSave, loading }: ChangePasswordModalProps) => {
    const { token } = theme.useToken();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const [form] = Form.useForm();

    useEffect(() => {
        if (open) form.resetFields();
    }, [open, form]);

    const handleOk = () => {
        form.validateFields().then(values => {
            onSave({ id: userId, password: values.password });
        });
    };

    const formContent = (
        <Form form={form} layout="vertical" style={{ marginTop: isMobile ? 0 : token.marginLG }}>
            <Form.Item
                name="password"
                label="Nueva Contraseña"
                rules={[
                    { required: true, message: 'Ingrese la nueva contraseña' },
                    { min: 6, message: 'Mínimo 6 caracteres' },
                    { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%&*])/, message: "Debe incluir mayúscula, minúscula, número y carácter especial (!@#$%&*)" }
                ]}
                hasFeedback
            >
                <Input.Password placeholder="Nueva contraseña segura" />
            </Form.Item>
            <Form.Item
                name="confirm"
                label="Confirmar Contraseña"
                dependencies={['password']}
                hasFeedback
                rules={[
                    { required: true, message: 'Confirme la contraseña' },
                    ({ getFieldValue }) => ({
                        validator(_, value) {
                            if (!value || getFieldValue('password') === value) return Promise.resolve();
                            return Promise.reject(new Error('Las contraseñas no coinciden'));
                        },
                    }),
                ]}
            >
                <Input.Password placeholder="Repita la nueva contraseña" />
            </Form.Item>
        </Form>
    );

    if (isMobile) {
        return (
            <Drawer
                title="Cambiar Clave de Acceso"
                placement="bottom"
                open={open}
                onClose={onCancel}
                styles={{ wrapper: { height: '50vh' } }}
                extra={<Button size="large" type="primary" icon={<CheckOutlined />} loading={loading} onClick={handleOk} />}
            >
                {formContent}
            </Drawer>
        );
    }

    return (
        <Modal
            title="Cambiar Clave de Acceso"
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            confirmLoading={loading}
        >
            {formContent}
        </Modal>
    );
};
