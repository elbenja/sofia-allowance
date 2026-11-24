import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Cancel01Icon, Delete02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons'
import { unlock, type Activity, type Entry } from './store'
import { Button, Icon, IconTile, TallyButton } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  unlocked: boolean
  onUnlock: () => void
  dayLabel: string
  dayEntries: Entry[] // what is already logged on that day
  activities: Activity[]
  onLog: (a: Pick<Activity, 'name' | 'amount' | 'icon' | 'tint'>) => void
  onChange: (activities: Activity[]) => void
}

const parseAmount = (raw: string) => {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export default function ChoresSheet({ open, onClose, unlocked, onUnlock, dayLabel, dayEntries, activities, onLog, onChange }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const addRef = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')

  useEffect(() => {
    const dialog = ref.current!
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('#parent-pin')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  // The form for a chore that is not on the list opens in its own small modal, on top of this one.
  useEffect(() => {
    const dialog = addRef.current!
    if (adding && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLElement>('input')?.focus()
    }
    if (!adding && dialog.open) dialog.close()
  }, [adding])

  const update = (id: string, patch: Partial<Activity>) => onChange(activities.map((a) => (a.id === id ? { ...a, ...patch } : a)))

  const custom = () => {
    const name = newName.trim()
    const amount = parseAmount(newAmount)
    return name && amount ? { name, amount, icon: 'star' as const, tint: '#f0f0f0' } : null
  }
  const clearCustom = () => {
    setNewName('')
    setNewAmount('')
  }

  return (
    <>
      <dialog
        ref={ref}
        className="sheet"
        aria-label="Add chores"
        onClose={() => {
          setEditing(false)
          onClose()
        }}
        onClick={(e) => e.target === ref.current && onClose()}
      >
        <div className="sheet__body">
          <div className="card__head sheet__head">
            <div>
              <h2>{unlocked ? 'Add chores' : 'Parent mode'}</h2>
              <span className="hint">{unlocked ? `Logging on ${dayLabel}` : 'Only a parent can add or remove chores.'}</span>
            </div>
            <div className="sheet__tools">
              {unlocked && (
                <Button variant={editing ? 'neutral' : 'quiet'} square aria-label="Edit the chore list" aria-pressed={editing} onClick={() => setEditing(!editing)}>
                  <Icon icon={PencilEdit02Icon} />
                </Button>
              )}
            </div>
          </div>

          {!unlocked ? (
            <PinForm onUnlock={onUnlock} />
          ) : (
            <>
              <div>
                {activities.map((a) => (
                  <div key={a.id} className="activity">
                    <IconTile icon={a.icon} tint={a.tint} size={36} />
                    {editing ? (
                      <>
                        <input
                          className="field activity__name"
                          defaultValue={a.name}
                          aria-label={`Name of ${a.name}`}
                          onBlur={(e) => e.target.value.trim() && update(a.id, { name: e.target.value.trim() })}
                        />
                        <label className="field field--money">
                          <span aria-hidden="true">$</span>
                          <input
                            defaultValue={a.amount}
                            inputMode="decimal"
                            aria-label={`Amount for ${a.name}`}
                            onBlur={(e) => {
                              const amount = parseAmount(e.target.value)
                              if (amount) update(a.id, { amount })
                              else e.target.value = String(a.amount)
                            }}
                          />
                        </label>
                        <Button variant="quiet" square className="danger" aria-label={`Delete ${a.name} from the list`} onClick={() => onChange(activities.filter((x) => x.id !== a.id))}>
                          <Icon icon={Delete02Icon} />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="activity__name">{a.name}</span>
                        <span className="mono">${a.amount}</span>
                        <TallyButton
                          label={`Log ${a.name} on ${dayLabel}`}
                          count={dayEntries.filter((e) => e.name === a.name).length}
                          onAdd={() => onLog(a)}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="sheet__foot">
            {unlocked && (
              <Button variant="neutral" onClick={() => setAdding(true)}>
                Another chore
              </Button>
            )}
            <Button variant={unlocked ? 'solid' : 'neutral'} onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={addRef}
        className="sheet"
        aria-label="Another chore"
        onClose={() => {
          clearCustom()
          setAdding(false)
        }}
        onClick={(e) => e.target === addRef.current && setAdding(false)}
      >
        <div className="sheet__body">
          <div className="sheet__tools sheet__close">
            <Button variant="quiet" square aria-label="Close" onClick={() => setAdding(false)}>
              <Icon icon={Cancel01Icon} />
            </Button>
          </div>

          <div className="custom">
            <input className="field custom__name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Chore name" aria-label="Chore name" />
            <label className="field field--money">
              <span aria-hidden="true">$</span>
              <input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Amount for the chore" />
            </label>
            <Button
              variant="neutral"
              disabled={!custom()}
              onClick={() => {
                onChange([...activities, { id: crypto.randomUUID(), ...custom()! }])
                setAdding(false)
              }}
            >
              Save chore
            </Button>
            <Button
              variant="solid"
              disabled={!custom()}
              onClick={() => {
                onLog(custom()!)
                setAdding(false)
              }}
            >
              Log once
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}

function PinForm({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPinValue] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const result = await unlock(pin)
    setBusy(false)
    if (result === 'ok') onUnlock()
    else if (result === 'wrong') fail('That PIN does not match.')
    else if (result === 'locked') fail('Too many wrong tries. Wait ten minutes.')
    else fail('No connection. Try again.')
  }

  function fail(message: string) {
    setError(message)
    setShake((n) => n + 1)
    setPinValue('')
  }

  return (
    <form className="pin" onSubmit={submit}>
      <label htmlFor="parent-pin">Parent PIN</label>
      <input
        key={shake}
        id="parent-pin"
        className={`field${shake ? ' field--shake' : ''}`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        value={pin}
        onChange={(e) => setPinValue(e.target.value)}
        aria-describedby={error ? 'pin-error' : undefined}
      />
      {error && (
        <span id="pin-error" role="alert" className="pin__error">
          {error}
        </span>
      )}
      <Button variant="solid" type="submit" disabled={!pin || busy}>
        {busy ? 'Checking…' : 'Unlock'}
      </Button>
    </form>
  )
}
