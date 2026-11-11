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
                label="Nueva contraseña"
                rules={[
                    { required: true, message: 'Ingresa la nueva contraseña' },
                    { min: 8, message: 'Mínimo 8 caracteres' },
                    { max: 128, message: 'Máximo 128 caracteres' },
                    { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%&*])/, message: "Debe incluir mayúscula, minúscula, número y carácter especial (!@#$%&*)" }
                ]}
                hasFeedback
            >
                <Input.Password placeholder="Nueva contraseña segura" />
            </Form.Item>
            <Form.Item
                name="confirm"
                label="Confirmar contraseña"
                dependencies={['password']}
                hasFeedback
                rules={[
                    { required: true, message: 'Confirma la contraseña' },
                    ({ getFieldValue }) => ({
                        validator(_, value) {
                            if (!value || getFieldValue('password') === value) return Promise.resolve();
                            return Promise.reject(new Error('Las contraseñas no coinciden'));
                        },
                    }),
                ]}
            >
                <Input.Password placeholder="Repite la nueva contraseña" />
            </Form.Item>
        </Form>
    );

    if (isMobile) {
        return (
            <Drawer
                title="Cambiar contraseña"
                placement="bottom"
                open={open}
                onClose={onCancel}
                mask={{ closable: false }}
                styles={{ wrapper: { height: '50vh' } }}
                extra={<Button size="large" type="primary" icon={<CheckOutlined />} loading={loading} onClick={handleOk}>Guardar</Button>}
            >
                {formContent}
            </Drawer>
        );
    }

    return (
        <Modal
            title="Cambiar contraseña"
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            okText="Guardar"
            mask={{ closable: false }}
            confirmLoading={loading}
        >
            {formContent}
        </Modal>
    );
};
