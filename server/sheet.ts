// The only door from the page to the Google Sheet. The sheet's link and its write
// key stay on the server (`sheet_url`, `sheet_key`); the parent PIN is checked here
// against `parent_pin`, so wrong PINs never reach Google.

interface Env {
  sheet_url?: string
  sheet_key?: string
  parent_pin?: string
}

const json = (data: object, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export async function sheet(request: Request, env: Env) {
  if (!env.sheet_url || !env.sheet_key || !env.parent_pin) return json({ ok: false, error: 'not-configured' }, 500)

  if (request.method === 'GET') return json(await (await fetch(env.sheet_url)).json())
  if (request.method !== 'POST') return json({ ok: false, error: 'bad-request' }, 405)

  const { pin, ...change } = (await request.json().catch(() => ({}))) as { pin?: unknown }
  if (pin !== env.parent_pin) {
    await new Promise((r) => setTimeout(r, 700)) // slows down guessing
    return json({ ok: false, error: 'pin' })
  }
  // The Apps Script still checks a secret; it is the server's key now, not the PIN.
  const res = await fetch(env.sheet_url, { method: 'POST', body: JSON.stringify({ ...change, pin: env.sheet_key }) })
  return json(await res.json())
}
