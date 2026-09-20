import { createContext, type FC, type ReactNode, useContext } from 'react';
import { message, notification } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { NotificationInstance } from 'antd/es/notification/interface';

type AntdApiContextType = {
    message: MessageInstance;
    notification: NotificationInstance;
};

const FeedbackContext = createContext<AntdApiContextType | null>(null);

export const FeedbackProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [messageApi, messageContextHolder] = message.useMessage();
    const [notificationApi, notificationContextHolder] = notification.useNotification({
        top: 76,
    });

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