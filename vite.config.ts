import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Matplanering/',
  server: {
    // Mathem's search API sends no CORS headers; prod goes through the recipe-proxy Worker.
    proxy: {
      '/mathem-api': {
        target: 'https://www.mathem.se',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/mathem-api/, ''),
      },
    },
  },
})
