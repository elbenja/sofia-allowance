// The Google Sheet is the source of truth, reached through /api/sheet. This
// browser only keeps a copy so the page opens instantly.

// The sheet's `icon` column. Any text is allowed: names the app doesn't know show a star.
export type IconKey = string

export interface Activity {
  id: string
  name: string
  amount: number
  icon: IconKey
  tint: string
}

// An entry keeps its own name and amount, so editing the template later
// never rewrites what was already earned.
export interface Entry {
  id: string
  date: string // YYYY-MM-DD
  name: string
  amount: number
  icon: IconKey
  tint: string
}

export interface Data {
  activities: Activity[]
  entries: Entry[]
}

const SHEET_URL = '/api/sheet'
const KEY = 'allowance-v1'

export function load(): Data {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // unreadable or blocked storage: fall through
  }
  return { activities: [], entries: [] }
}

export function save(data: Data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage blocked (private window): the page still works for this visit
  }
}

// ── Google Sheet ──

export type Change =
  | { action: 'addEntry'; entry: Entry }
  | { action: 'removeEntry'; id: string }
  | { action: 'setActivities'; activities: Activity[] }

// The parent PIN is kept only in memory while parent mode is open, and
// /api/sheet checks it on every write.
let pin = ''
let pending = 0

async function post(body: object): Promise<'ok' | 'pin' | 'locked'> {
  const res = await fetch(SHEET_URL, { method: 'POST', body: JSON.stringify({ pin, ...body }) })
  const json = await res.json()
  if (json.ok) return 'ok'
  if (json.error === 'pin' || json.error === 'locked') return json.error
  throw new Error(json.error)
}

// Returns null while a write is still on its way, so an older copy of the
// sheet never replaces what was just added on screen.
export async function fetchData(): Promise<Data | null> {
  const res = await fetch(SHEET_URL)
  const json = await res.json()
  if (!json.ok) throw new Error('read failed')
  return pending > 0 ? null : { activities: json.activities, entries: json.entries }
}

export async function send(change: Change) {
  pending++
  try {
    if ((await post(change)) !== 'ok') throw new Error('rejected')
  } finally {
    pending--
  }
}

export async function unlock(value: string): Promise<'ok' | 'wrong' | 'locked' | 'offline'> {
  pin = value
  try {
    const result = await post({ action: 'check' })
    if (result === 'ok') return 'ok'
    pin = ''
    return result === 'pin' ? 'wrong' : 'locked'
  } catch {
    pin = ''
    return 'offline'
  }
}

export function lock() {
  pin = ''
}
