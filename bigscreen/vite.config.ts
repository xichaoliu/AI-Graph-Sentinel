import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  '/api': {
    target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 本地 npm run dev 时把 /api（含 SSE）代理到 FastAPI；Docker 里由 nginx 代理
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
