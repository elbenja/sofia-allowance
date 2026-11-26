// The site-wide password gate, shared by the Vercel middleware, the login function
// and the Vite dev server. The password lives only on the server (the `password`
// env var, never VITE_-prefixed). A good login gets an HttpOnly cookie holding an
// HMAC of a fixed label keyed by the password, so changing the password signs
// everyone out.

export const COOKIE = 'allowance_session'
const MAX_AGE = 60 * 60 * 24 * 90 // 90 days

async function token(password: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('sofia-allowance-session'))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hasSession(cookieHeader: string | null, password: string | undefined) {
  if (!password || !cookieHeader) return false
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]+)`))
  return !!match && match[1] === (await token(password))
}

export async function login(request: Request, password: string | undefined, secure: boolean) {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  if (!password) return Response.json({ error: 'not-configured' }, { status: 500 })
  const body = (await request.json().catch(() => ({}))) as { password?: unknown }
  if (body.password !== password) {
    await new Promise((r) => setTimeout(r, 700)) // slows down guessing
    return Response.json({ error: 'wrong' }, { status: 401 })
  }
  const cookie = `${COOKIE}=${await token(password)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } })
}

// Signs this browser out by expiring its cookie. The page can't do it itself,
// because the cookie is HttpOnly. POST only, so a stray link can't sign anyone out.
export function logout(request: Request, secure: boolean) {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const cookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } })
}
