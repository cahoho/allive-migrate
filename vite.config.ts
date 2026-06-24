import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/allive-migrate/',
  server: {
    port: 5173,
    host: true
  }
})
