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
dayjs.locale(locale_es)

// El layout autenticado (App) es el elemento raíz; los módulos son rutas hijas
// con `lazy`, de modo que useNavigation() expone el estado de carga del chunk.
const router = createBrowserRouter([
  { path: '/', element: <App />, children: childRoutes },
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ConfigProvider locale={esEs} theme={{
    algorithm: [theme.defaultAlgorithm],
    token: {
      colorPrimary: BRAND.primary,
    },
    components: {
      Layout: {
        headerBg: BRAND.header,
        siderBg: BRAND.sider,
        bodyBg: BRAND.body,
      },
    },
  }}>
    <FeedbackProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </FeedbackProvider>
  </ConfigProvider>
)
