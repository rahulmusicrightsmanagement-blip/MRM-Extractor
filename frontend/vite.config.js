import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so both localhost and 127.0.0.1 resolve in dev.
    host: true,
    port: 5173,
    strictPort: true,
  },
})
