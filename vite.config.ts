import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev stand-in for the recipe-proxy Worker (which only allows the prod origin). */
function devFetchProxy(): Plugin {
  return {
    name: 'dev-fetch-proxy',
    configureServer(server) {
      server.middlewares.use('/__proxy', async (req, res) => {
        const target = new URL(req.url ?? '', 'http://x').searchParams.get('url')
        if (!target || !/^https:\/\//.test(target)) {
          res.statusCode = 400
          res.end('Missing or non-https url')
          return
        }
        try {
          const upstream = await fetch(target, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MatplaneringRecipeFetcher/1.0)' },
            redirect: 'follow',
          })
          res.statusCode = upstream.status
          res.setHeader('content-type', upstream.headers.get('content-type') || 'text/plain')
          res.end(Buffer.from(await upstream.arrayBuffer()))
        } catch (e) {
          res.statusCode = 502
          res.end(String(e))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devFetchProxy()],
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
