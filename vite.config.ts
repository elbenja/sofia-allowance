import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { hasSession, login } from './server/auth.js'
import { sheet } from './server/sheet.js'

// In `npm run dev` there is no Vercel, so this plays the middleware and the two
// functions, reading the secrets from .env.local.
function passwordGate(env: Record<string, string>): Plugin {
  const { password } = env
  return {
    name: 'password-gate',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        const authed = await hasSession(req.headers.cookie ?? null, password)
        if (path === '/api/login' || (path === '/api/sheet' && authed)) {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const request = new Request('http://localhost' + path, { method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined })
          const response = path === '/api/login' ? await login(request, password, false) : await sheet(request, env)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          return res.end(await response.text())
        }
        if (path === '/login') req.url = '/login.html'
        else if ((path === '/' || path === '/index.html' || path === '/api/sheet') && !authed) {
          res.statusCode = 307
          res.setHeader('Location', '/login')
          return res.end()
        }
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), passwordGate(loadEnv(mode, process.cwd(), ''))],
  build: { rollupOptions: { input: { main: 'index.html', login: 'login.html' } } },
}))
