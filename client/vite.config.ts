import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    watch: {
      usePolling: true,   // required when Vite runs in WSL watching Windows-side files
      interval: 1000,
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
  },
})
