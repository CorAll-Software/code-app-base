// import { MessageInstance } from "antd/es/message/interface"

interface Window {
    _isMobile: boolean
    /** Sello del build. Sin `<meta build-version>` (dev) no existe. */
    _buildInfo?: {
        code: string
        device: string
        datetime: number
        date: string
    }
    _routeApi: string
    _routeWs: string
    _routeCaptcha: string
    /** DSN de Sentry. Vacío = reporte de errores desactivado (dev o sin configurar). */
    _sentryDsn: string
    _sentryEnvironment: string
    /** localhost/127.0.0.1. Criterio único de dev/prod, calculado en index.html. */
    _isDevelopment: boolean
    messageApi: MessageInstance
    notificationApi: NotificationInstance
}