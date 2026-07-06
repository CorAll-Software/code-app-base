import { Modal, Drawer, Button, Grid } from 'antd';
import { ReactNode } from 'react';
import { CheckOutlined } from '@ant-design/icons';

export interface StandardModalFormProps {
    open: boolean;
    title: string;
    onCancel: () => void;
    onOk?: () => void;
    
    loading?: boolean;
    children: ReactNode;
    
    width?: number;
    okText?: string;
    cancelText?: string;
    
    footer?: ReactNode;
}

export const StandardModalForm = ({
    open,
    title,
    onCancel,
    onOk,
    loading,
    children,
    width = 700,
    okText = "Guardar",
    cancelText = "Cancelar",
    footer
}: StandardModalFormProps) => {
    const screens = Grid.useBreakpoint();
    // Default to false so SSR/Initial render doesn't flicker, checking strictly on screen size
    const isMobile = screens.md === false;

    if (isMobile) {
        return (
            <Drawer
                title={title}
                placement="bottom"
                open={open}
                onClose={onCancel}
                styles={{ 
                    wrapper: { height: '92vh' }, 
                    body: { padding: '8px 12px 80px' } 
                }}
                extra={
                    onOk && (
                        <Button 
                            size="large" 
                            type="primary" 
                            icon={<CheckOutlined />} 
                            loading={loading} 
                            onClick={onOk}
                        >
                        </Button>
                    )
                }
            >
               {children}
            </Drawer>
        );
    }

    return (
        <Modal
            title={title}
            open={open}
            onOk={onOk}
            onCancel={onCancel}
            confirmLoading={loading}
            width={width}
            okText={okText}
            cancelText={cancelText}
            footer={footer}
        >
            <div style={{ marginTop: '20px' }}>
                {children}
            </div>
        </Modal>
    );
};
