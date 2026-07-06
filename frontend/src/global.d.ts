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
    _s3Bucket: string
    _accountId: string
    _projectId: number
    _projectInfo: {
        id: number,
        name: string,
        description: string,
        company?: string,
        logo: string
    }
    _params: {
        [key: string]: string
    }
    _userData: any
    messageApi: MessageInstance
    notificationApi: NotificationInstance
}