import { useEffect, useRef, useState } from 'react'
import { Add01Icon, Delete02Icon, SquareLock02Icon, SquareUnlock02Icon } from '@hugeicons/core-free-icons'
import AuroraBackground from './AuroraBackground'
import ChoresSheet from './ChoresSheet'
import DogAvatar, { type DogHandle } from './DogAvatar'
import { AVATAR_URL, KID_NAME } from './kid'
import { chores, money, pad, shortMoney } from './format'
import { fetchData, load, lock, save, send, type Activity, type Change, type Data, type Entry } from './store'
import { Button, Count, Icon, IconTile } from './ui'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// One colour per month, pink in January through blue in December.
const MONTH_COLORS = ['#fc1264', '#ea1679', '#d71a8f', '#c51da4', '#b121bb', '#a124ce', '#8e29df', '#7134e1', '#583ee2', '#3c48e3', '#2153e4', '#035fe5']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] // Date.getDay() order
const CALENDAR_WEEKDAYS = [...WEEKDAYS.slice(1), WEEKDAYS[0]] // the calendar starts on Monday
const LOCK_LEAVE_MS = 700 // matches the lock-leave animation in styles.css

const sum = (list: Entry[]) => list.reduce((t, e) => t + e.amount, 0)

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function shiftMonth(key: string, by: number) {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + by, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${MONTHS[m - 1].slice(0, 3)} ${d}`
}

export default function App() {
  const today = todayKey()
  const [data, setData] = useState<Data>(load)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [day, setDay] = useState(today)
  const [unlocked, setUnlocked] = useState(false)
  const [leaving, setLeaving] = useState(false) // the lock button's exit after logging out
  const [sheetOpen, setSheetOpen] = useState(false)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo?: Entry } | null>(null)
  const [loading, setLoading] = useState(data.activities.length === 0)
  const logRef = useRef<HTMLDivElement>(null)
  const dogRef = useRef<DogHandle>(null)

  useEffect(() => save(data), [data])

  // Read the sheet on opening, whenever the page comes back into view or its window
  // gets focus, and when the chores list opens. That way a chore added on another
  // device shows up, and an amount changed in the sheet is the one that gets logged.
  const refresh = useRef(() => {})
  useEffect(() => {
    refresh.current = () =>
      fetchData()
        .then((fresh) => fresh && setData(fresh))
        .catch(() => setToast({ text: 'Offline. Showing the last saved copy.' }))
        .finally(() => setLoading(false))
    const onVisible = () => document.visibilityState === 'visible' && refresh.current()
    const onFocus = () => refresh.current()
    refresh.current()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  function openSheet() {
    refresh.current()
    setSheetOpen(true)
  }

  // The toast leaves by itself.
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(t)
  }, [toast])

  // Picking a day brings its entries into view inside the log (desktop only:
  // on a phone the log is not a scroll box, and the page must not jump).
  useEffect(() => {
    const box = logRef.current
    const head = box?.querySelector<HTMLElement>(`[data-date="${day}"]`)
    if (box && head) box.scrollTo({ top: head.offsetTop - box.offsetTop, behavior: 'smooth' })
  }, [day])

  const year = Number(month.slice(0, 4))
  const monthIndex = Number(month.slice(5, 7)) - 1
  const monthName = MONTHS[monthIndex]

  const inMonth = data.entries.filter((e) => e.date.startsWith(month))
  const total = sum(inMonth)
  const previousMonth = shiftMonth(month, -1)
  const previousMonthName = MONTHS[Number(previousMonth.slice(5, 7)) - 1]
  const previousTotal = sum(data.entries.filter((e) => e.date.startsWith(previousMonth)))
  const delta = total - previousTotal

  const byDay = new Map<string, Entry[]>()
  for (const e of inMonth) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
  let best: { date: string; amount: number } | null = null
  for (const [date, list] of days) {
    const amount = sum(list)
    if (!best || amount > best.amount) best = { date, amount }
  }

  const yearTotals = MONTHS.map((_, i) => sum(data.entries.filter((e) => e.date.startsWith(`${year}-${pad(i + 1)}`))))
  const yearMax = Math.max(...yearTotals, 1)

  const leadingBlanks = (new Date(year, monthIndex, 1).getDay() + 6) % 7 // Monday first
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const selectedEntries = byDay.get(day) ?? []

  function goMonth(key: string) {
    setMonth(key)
    setDay(key === today.slice(0, 7) ? today : key + '-01')
  }

  // The screen changes first; the sheet follows. If the sheet refuses or the
  // connection drops, say so and show what the sheet really holds.
  function push(change: Change) {
    send(change).catch(() => {
      setToast({ text: 'Could not save. Check the connection.' })
      fetchData()
        .then((fresh) => fresh && setData(fresh))
        .catch(() => {})
    })
  }

  function logEntry(a: Pick<Activity, 'name' | 'amount' | 'icon' | 'tint'>) {
    const entry: Entry = { id: crypto.randomUUID(), date: day, name: a.name, amount: a.amount, icon: a.icon, tint: a.tint }
    setData((d) => ({ ...d, entries: [...d.entries, entry] }))
    push({ action: 'addEntry', entry })
    setFreshId(entry.id)
    dogRef.current?.react('euphoric', 2200) // money in: the dog celebrates
  }

  function removeEntry(entry: Entry) {
    setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== entry.id) }))
    push({ action: 'removeEntry', id: entry.id })
    setToast({ text: `Removed ${entry.name}`, undo: entry })
  }

  function undoRemove(entry: Entry) {
    setData((d) => ({ ...d, entries: [...d.entries, entry] }))
    push({ action: 'addEntry', entry })
    dogRef.current?.react('happy', 1800)
    setToast(null)
  }

  function setActivities(activities: Activity[]) {
    setData((d) => ({ ...d, activities }))
    push({ action: 'setActivities', activities })
  }

  // Locking again: the button stays for its exit animation (lock-leave in styles.css) while the dog waves goodbye.
  function logOut() {
    lock()
    setUnlocked(false)
    setLeaving(true)
    window.setTimeout(() => setLeaving(false), LOCK_LEAVE_MS)
    dogRef.current?.react('wave', 2400)
  }

  // Locks parent mode again. Desktop shows it beside Add chores; a phone shows it at the top.
  const lockButton = (unlocked || leaving) && (
    <Button variant="quiet" square aria-label="Lock parent mode" disabled={!unlocked} onClick={logOut}>
      <Icon icon={SquareUnlock02Icon} />
    </Button>
  )
  const lockLeaving = leaving && !unlocked ? ' lock--leaving' : ''

  return (
    <>
    <AuroraBackground parent={unlocked} />
    <div className={`app${unlocked ? ' app--parent' : ''}`}>
      <header className="header">
        <div className="greeting">
          {/* Without a picture, the circle shows the name's first letter. */}
          <span className="avatar" aria-hidden="true">
            {AVATAR_URL ? <img src={AVATAR_URL} alt="" width={34} height={34} /> : KID_NAME.charAt(0)}
          </span>
          <div>
            <h1>{KID_NAME ? `Hi, ${KID_NAME}` : 'Hi there'}</h1>
            <p>Chores and tips</p>
          </div>
        </div>

        <div className="controls">
          {/* Parent actions share one floating container: locked, a single "Parents"
              button; unlocked, "Add chores" plus the button that locks again. */}
          <div className="parent-actions">
            <Button variant="solid" className="add" onClick={openSheet}>
              <Icon icon={unlocked ? Add01Icon : SquareLock02Icon} className="nudge-start" />
              {unlocked ? 'Add chores' : 'Parents'}
            </Button>
            {lockButton && <span className={`lock-beside${lockLeaving}`}>{lockButton}</span>}
          </div>
        </div>
        {lockButton && <div className={`lock-top${lockLeaving}`}>{lockButton}</div>}
      </header>

      <div className="overview">
        <div className="summary-wrap">
          <DogAvatar ref={dogRef} />
          <section className="card summary" aria-label={`Tips in ${monthName}`}>
            <span className="summary__label">Tips in {monthName}</span>
            <span className="summary__total">
              <Count value={total} format={money} />
            </span>
            <div className="chips">
              {(total > 0 || previousTotal > 0) && (
                <span className={`chip chip--mono${delta >= 0 ? ' chip--up' : ''}`}>
                  {delta >= 0 ? '+' : '−'}
                  {money(Math.abs(delta))} vs {previousMonthName}
                </span>
              )}
              <span className="chip">{chores(inMonth.length)}</span>
              {best && (
                <span className="chip">
                  Best day: {dayLabel(best.date)} · {money(best.amount)}
                </span>
              )}
            </div>
          </section>
        </div>

        <section className="card">
          <h2>Months of {year}</h2>
          <div className="bars">
            {MONTHS.map((name, i) => {
              const key = `${year}-${pad(i + 1)}`
              const amount = yearTotals[i]
              return (
                <button
                  key={key}
                  type="button"
                  className={`bar-cell${key === month ? ' bar-cell--selected' : ''}`}
                  aria-label={`${name}: ${money(amount)}`}
                  aria-pressed={key === month}
                  onClick={() => goMonth(key)}
                >
                  <span className="bar-cell__amount">{amount > 0 ? shortMoney(amount) : ''}</span>
                  <span className="bar" style={{ height: amount > 0 ? Math.max(8, Math.round((amount / yearMax) * 82)) : 4, background: MONTH_COLORS[i] }} />
                  <span className="bar-cell__name">
                    <span className="wide">{name.slice(0, 3)}</span>
                    <span className="narrow">{name[0]}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      <div className="details">
        <section className="card">
          <div className="card__head">
            <h2>Calendar</h2>
            <span className="hint">Pick a day</span>
          </div>
          <div className="week week--names" aria-hidden="true">
            {CALENDAR_WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div key={month} className="week week--days">
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <span key={'blank' + i} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = `${month}-${pad(i + 1)}`
              const earned = sum(byDay.get(date) ?? [])
              const state = date === day ? ' day--selected' : earned > 0 ? ' day--earned' : ''
              return (
                <button
                  key={date}
                  type="button"
                  className={`day${state}${date === today ? ' day--today' : ''}`}
                  aria-label={`${dayLabel(date)}${earned > 0 ? `, ${money(earned)}` : ''}${date === today ? ', today' : ''}`}
                  aria-pressed={date === day}
                  onClick={() => setDay(date)}
                >
                  <span className="day__num">{i + 1}</span>
                  <span className="day__amount">{earned > 0 ? shortMoney(earned) : ''}</span>
                </button>
              )
            })}
          </div>
          <div className="day-summary">
            <div>
              <strong>{dayLabel(day)}</strong>
              <span key={day + selectedEntries.length}>
                {selectedEntries.length === 0 ? 'No chores yet' : `${chores(selectedEntries.length)} · ${money(sum(selectedEntries))}`}
              </span>
            </div>
            {unlocked && (
              <Button variant="neutral" onClick={openSheet}>
                <Icon icon={Add01Icon} className="nudge-start" />
                Add
              </Button>
            )}
          </div>
        </section>

        <section className={`card log${unlocked ? ' log--admin' : ''}`}>
          <div className="card__head">
            <h2>{monthName} log</h2>
            <span className="log__total">
              <Count value={total} format={money} />
            </span>
          </div>
          {days.length === 0 ? (
            <p className="empty">{loading ? 'Loading…' : `No chores in ${monthName} yet.`}</p>
          ) : (
            <div className="log__scroll" ref={logRef}>
              {days.map(([date, list]) => (
                <div key={date} data-date={date}>
                  <div className={`log__day${date === day ? ' log__day--selected' : ''}`}>
                    <span>{dayLabel(date)}</span>
                    <span className="mono">{money(sum(list))}</span>
                  </div>
                  {list.map((e) => (
                    <div key={e.id} className={`entry${e.id === freshId ? ' entry--fresh' : ''}`}>
                      <IconTile icon={e.icon} tint={e.tint} />
                      <span className="entry__name">{e.name}</span>
                      <span className="mono entry__amount">{money(e.amount)}</span>
                      {unlocked && (
                        <Button variant="quiet" className="entry__remove" aria-label={`Remove ${e.name}, ${dayLabel(e.date)}`} onClick={() => removeEntry(e)}>
                          <Icon icon={Delete02Icon} size={16} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ChoresSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        unlocked={unlocked}
        onUnlock={() => setUnlocked(true)}
        dayLabel={dayLabel(day)}
        dayEntries={selectedEntries}
        activities={data.activities}
        onLog={logEntry}
        onChange={setActivities}
      />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" onClick={() => undoRemove(toast.undo!)}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
    </>
  )
}
