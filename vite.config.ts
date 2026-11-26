import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleIca } from './cloudflare/recipe-proxy/worker.js'

/** Dev stand-in for the Worker's /ica/* routes (same code, see worker.js). */
function icaDevProxy(): Plugin {
  return {
    name: 'ica-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/ica-api', async (req, res) => {
        const url = new URL('http://localhost/ica' + (req.url ?? ''))
        const { status, body } = await handleIca(url)
        res.statusCode = status
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(body))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), icaDevProxy()],
  base: '/Matplanering/',
  server: {
    // Mathem's search API sends no CORS headers; prod goes through the recipe-proxy Worker.
    proxy: {
      '/mathem-api': {
        target: 'https://www.mathem.se',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/mathem-api/, ''),
      },
      // Willys refuses requests carrying another site's Origin, so drop it.
      '/willys-api': {
        target: 'https://www.willys.se',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/willys-api/, ''),
        configure: proxy => proxy.on('proxyReq', req => { req.removeHeader('origin'); req.removeHeader('referer') }),
      },
    },
  },
})
