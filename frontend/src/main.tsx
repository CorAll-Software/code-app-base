import { ConfigProvider, theme } from 'antd'
import esEs from 'antd/locale/es_ES'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import { childRoutes } from './router.config'
import './index.scss'
import { FeedbackProvider } from './providers/message.provider'
import './utils.scss'

//! configuracion de dayjs 
// importacion de plugin para dayjs
import dayjs from 'dayjs'
import weekOfYear from 'dayjs/plugin/weekOfYear'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(weekOfYear)
dayjs.extend(relativeTime)

import { AuthProvider } from '@src/providers/auth-provider'
import locale_es from 'dayjs/locale/es'
import { BRAND } from '@src/core/color'
import { initSentry } from '@src/core/sentry'
import { AppErrorBoundary, RouteErrorBoundary } from '@src/layouts/error-boundary'
dayjs.locale(locale_es)

// Antes de montar nada: así un fallo durante el primer render ya se captura.
initSentry()

// El layout autenticado (App) es el elemento raíz; los módulos son rutas hijas
// con `lazy`, de modo que useNavigation() expone el estado de carga del chunk.
// `errorElement` en la raíz cubre lo que revienta en el propio layout `App`;
// cada ruta hija lleva el suyo (ver router.config.tsx) para que un fallo de
// pantalla no se lleve por delante el menú.
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteErrorBoundary />,
    children: childRoutes,
  },
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ConfigProvider locale={esEs} theme={{
    algorithm: [theme.defaultAlgorithm],
    token: {
      colorPrimary: BRAND.primary,
      // Texto secundario (`Text type="secondary"`, ayudas de formulario): el
      // 0.45 por defecto da 3.4:1 sobre blanco; 0.6 da 5.7:1.
      colorTextDescription: 'rgba(0, 0, 0, 0.6)',
      fontFamily: "'Nunito', Inter, system-ui, Avenir, Helvetica, Arial, sans-serif",
      borderRadius: 8,
    },
    components: {
      Layout: {
        headerBg: BRAND.header,
        siderBg: BRAND.sider,
        bodyBg: BRAND.body,
      },
    },
  }}>
    <AppErrorBoundary>
      <FeedbackProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </FeedbackProvider>
    </AppErrorBoundary>
  </ConfigProvider>
)
