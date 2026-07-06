import { WarningOutlined } from '@ant-design/icons';
import { Button, Modal, theme, Typography } from 'antd';

const { Text, Title } = Typography;

interface MobileDeleteConfirmProps {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    confirmLoading?: boolean;
}

export const MobileDeleteConfirm = ({ open, title, description, onConfirm, onCancel, confirmLoading }: MobileDeleteConfirmProps) => {
    const { token } = theme.useToken();

    return (
        <Modal
            open={open}
            centered
            closable={false}
            footer={null}
            width={320}
            styles={{
                root: { borderRadius: 20, padding: '32px 24px 24px', textAlign: 'center' as const },
                mask: { backdropFilter: 'blur(4px)' },
            }}
            onCancel={onCancel}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: token.colorErrorBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 4,
                }}>
                    <WarningOutlined style={{ fontSize: 28, color: token.colorError }} />
                </div>

                <Title level={5} style={{ margin: 0 }}>{title}</Title>
                <Text type="secondary" style={{ fontSize: 14 }}>{description}</Text>

                <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 8 }}>
                    <Button
                        block
                        size="large"
                        onClick={onCancel}
                        style={{ borderRadius: 12, height: 48, fontWeight: 500 }}
                    >
                        Cancelar
                    </Button>
                    <Button
                        block
                        danger
                        type="primary"
                        size="large"
                        loading={confirmLoading}
                        onClick={onConfirm}
                        style={{ borderRadius: 12, height: 48, fontWeight: 500 }}
                    >
                        Eliminar
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
