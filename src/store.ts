// With VITE_SHEET_URL set, the Google Sheet is the source of truth and this
// browser only keeps a copy so the page opens instantly. Without it, the page
// runs on sample data kept in this browser.

export type IconKey = 'bed' | 'shirt' | 'paw' | 'vacuum' | 'pot' | 'star'

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

const SHEET_URL: string | undefined = import.meta.env.VITE_SHEET_URL
export const online = Boolean(SHEET_URL)

const KEY = 'allowance-v1'
const PIN_KEY = 'allowance-pin'

function seed(): Data {
  const activities: Activity[] = [
    { id: 'room', name: 'Making the room', amount: 5, icon: 'bed', tint: '#feede6' },
    { id: 'clothes', name: 'Folding the clothes', amount: 2, icon: 'shirt', tint: '#eaf2ff' },
    { id: 'leo', name: 'Taking out Leo', amount: 2, icon: 'paw', tint: '#fff6e0' },
    { id: 'vacuum', name: 'Vacuuming', amount: 15, icon: 'vacuum', tint: '#e9fbed' },
    { id: 'cook', name: 'Cooking and cutting', amount: 3, icon: 'pot', tint: '#feece9' },
  ]
  const raw = [
    '09-05:room', '09-08:leo', '09-12:clothes', '09-13:cook', '09-19:room', '09-22:leo', '09-26:vacuum', '09-27:leo', '09-29:clothes',
    '10-03:room', '10-04:cook', '10-06:leo', '10-10:vacuum', '10-11:clothes', '10-13:leo', '10-17:room', '10-18:cook', '10-20:leo', '10-24:clothes', '10-25:room', '10-31:leo',
    '11-02:room', '11-03:leo', '11-05:clothes', '11-07:vacuum', '11-08:cook', '11-09:room', '11-10:leo', '11-12:leo', '11-14:clothes', '11-14:room', '11-15:cook', '11-17:leo', '11-19:clothes', '11-21:vacuum', '11-21:room', '11-22:leo',
  ]
  const entries = raw.map((r, i) => {
    const [date, actId] = r.split(':')
    const a = activities.find((x) => x.id === actId)!
    return { id: 'seed-' + i, date: '2026-' + date, name: a.name, amount: a.amount, icon: a.icon, tint: a.tint }
  })
  return { activities, entries }
}

export function load(): Data {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // unreadable or blocked storage: fall through
  }
  return online ? { activities: [], entries: [] } : seed()
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

// The parent PIN is kept only in memory while parent mode is open, and the
// sheet's script checks it on every write.
let pin = ''
let pending = 0

// Sent as plain text on purpose: Apps Script cannot answer the browser's
// permission pre-check that a JSON content type would trigger.
async function post(body: object): Promise<'ok' | 'pin' | 'locked'> {
  const res = await fetch(SHEET_URL!, { method: 'POST', body: JSON.stringify({ pin, ...body }) })
  const json = await res.json()
  if (json.ok) return 'ok'
  if (json.error === 'pin' || json.error === 'locked') return json.error
  throw new Error(json.error)
}

// Returns null while a write is still on its way, so an older copy of the
// sheet never replaces what was just added on screen.
export async function fetchData(): Promise<Data | null> {
  const res = await fetch(SHEET_URL!)
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
  if (!online) return (await checkPin(value)) ? 'ok' : 'wrong'
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

// ── Sample mode (no sheet connected) ──
// Here the PIN only hides the editing controls on this device.
async function hash(pin: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('allowance:' + pin))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function hasPin() {
  return localStorage.getItem(PIN_KEY) !== null
}

export async function setPin(pin: string) {
  localStorage.setItem(PIN_KEY, await hash(pin))
}

async function checkPin(pin: string) {
  return localStorage.getItem(PIN_KEY) === (await hash(pin))
}
