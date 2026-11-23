import { hasSession } from './server/auth.js'

// Vercel runs this before every page request except the login page, its function
// and the built assets (hashed file names, only discoverable from the gated page).
export const config = { matcher: ['/((?!login|api/login|assets/|favicon|apple-touch-icon|og-image).*)'] }

export default async function middleware(request: Request) {
  if (await hasSession(request.headers.get('cookie'), process.env.password)) return
  return Response.redirect(new URL('/login', request.url), 307)
}
