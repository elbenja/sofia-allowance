import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { hasSession, login, logout } from './server/auth.js'
import { sheet } from './server/sheet.js'

// In `npm run dev` there is no Vercel, so this plays the middleware and the three
// functions, reading the secrets from .env.local.
function passwordGate(env: Record<string, string>): Plugin {
  const { password } = env
  const routes: Record<string, (request: Request) => Response | Promise<Response>> = {
    '/api/login': (request) => login(request, password, false),
    '/api/logout': (request) => logout(request, false),
    '/api/sheet': (request) => sheet(request, env), // signed-in only, checked below
  }
  return {
    name: 'password-gate',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '/').split('?')[0]
        const authed = await hasSession(req.headers.cookie ?? null, password)
        const route = routes[path]
        if (route && (path !== '/api/sheet' || authed)) {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const request = new Request('http://localhost' + path, { method: req.method, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined })
          const response = await route(request)
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

// Link previews need the share image's full address. Vercel's build knows the site's
// production domain, so the code holds none; elsewhere the link stays relative.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ''
const siteUrl: Plugin = {
  name: 'site-url',
  transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE_URL%', SITE_URL) },
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrl, passwordGate(loadEnv(mode, process.cwd(), ''))],
  build: { rollupOptions: { input: { main: 'index.html', login: 'login.html' } } },
}))
