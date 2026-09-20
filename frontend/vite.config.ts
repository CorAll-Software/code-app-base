import { defineConfig } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import react from '@vitejs/plugin-react-swc'
import analyze from 'rollup-plugin-analyzer'
import path from 'path'

const nn = (n: number) => n < 10 ? '0' + n : n
const build1 = Math.floor(Date.now() / 10000).toString(36).toUpperCase()
const hostname = process.env.USERNAME?.toUpperCase() || 'DEV'
const date = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${nn(d.getMonth() + 1)}-${nn(d.getDate())} ${nn(d.getHours())}:${nn(d.getMinutes())}:${nn(d.getSeconds())}`
})();

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 5004,
    open: true,
  },
  plugins: [
    react(),
    createHtmlPlugin({
      minify: false,
      inject: { data: { buildVersion: `${build1}.${hostname}.${date}` } }
    })
  ],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      plugins: [analyze({ summaryOnly: true, limit: 16 })],
      output: {
        minifyInternalExports: true,
        // Vite 8 (rolldown) exige que manualChunks sea una función.
        // El orden importa: charts antes que antd, porque @ant-design/plots
        // cae bajo @ant-design.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          // Antes que la regla de react: la ruta de `@sentry/react` contiene
          // `/react/` y si no, caería en vendor-react e invalidaría su caché
          // cada vez que se actualice el SDK.
          if (id.includes('@sentry')) return 'vendor-sentry';
          if (
            id.includes('@ant-design/plots') ||
            id.includes('@antv') ||
            id.includes('chart.js') ||
            id.includes('react-chartjs-2')
          ) return 'vendor-charts';
          if (
            id.includes('antd') ||
            id.includes('@ant-design') ||
            id.includes('rc-') ||
            id.includes('@rc-component')
          ) return 'vendor-antd';
          if (
            id.includes('react-router') ||
            id.includes('react-dom') ||
            id.includes('scheduler') ||
            /[\\/]react[\\/]/.test(id)
          ) return 'vendor-react';
        },
      } as any
    }
  },
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, 'src'),
      "@assets": path.resolve(__dirname, 'src/assets'),
      "@components": path.resolve(__dirname, 'src/components'),
      "@styles": path.resolve(__dirname, 'src/styles'),
      "@pages": path.resolve(__dirname, 'src/pages'),
      "@core": path.resolve(__dirname, 'src/core'),
      "@providers": path.resolve(__dirname, 'src/providers'),
      "@layouts": path.resolve(__dirname, 'src/layouts'),
      "@services": path.resolve(__dirname, 'src/services'),
      "@modules": path.resolve(__dirname, 'src/modules'),
    }
  },
})
