import { createContext, type FC, type ReactNode, useContext } from 'react';
import { message, notification } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';

type AntdApiContextType = {
    message: MessageInstance;
    notification: NotificationInstance;
};

const FeedbackContext = createContext<AntdApiContextType | null>(null);

// Fuera del componente: `useNotification` memoiza su API con la config como
// dependencia, y un literal inline la haría inestable en cada render.
const NOTIFICATION_CONFIG = { top: 76 };

export const FeedbackProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [messageApi, messageContextHolder] = message.useMessage();
    const [notificationApi, notificationContextHolder] = notification.useNotification(NOTIFICATION_CONFIG);

    window.messageApi = messageApi;
    window.notificationApi = notificationApi;

    return (
        <FeedbackContext.Provider value={{ message: messageApi, notification: notificationApi }}>
            {messageContextHolder}
            {notificationContextHolder}
            {children}
        </FeedbackContext.Provider>
    );
};

export const useFeedback = () => {
    const context = useContext(FeedbackContext);
    if (!context) {
        throw new Error('useAntdApi debe usarse dentro de <AntdApiProvider>');
    }
    return context;
};