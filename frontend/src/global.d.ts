// import { MessageInstance } from "antd/es/message/interface"

interface Window {
    _isMobile: boolean
    _buildInfo: {
        code: string
        device: string
        datetime: number
        date: string
    }
    _routeApi: string
    _routeWs: string
    _routeCaptcha: string
    messageApi: MessageInstance
    notificationApi: NotificationInstance
}