import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent } from 'react'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { Add01Icon, BedIcon, CookingPotIcon, DishWasherIcon, KitchenUtensilsIcon, PawPrintIcon, StarIcon, Tick02Icon, TShirtIcon, VacuumCleanerIcon, WashingMachineIcon } from '@hugeicons/core-free-icons'
import type { IconKey } from './store'

// Names that can go in the sheet's icon column. Hugeicons' own names work too for the ones
// listed here (vacuum-cleaner, kitchen-utensils). Hugeicons has no dog, so `dog` is a paw.
export const ACTIVITY_ICONS: Record<string, IconSvgElement> = {
  bed: BedIcon,
  shirt: TShirtIcon,
  paw: PawPrintIcon,
  dog: PawPrintIcon,
  vacuum: VacuumCleanerIcon,
  'vacuum-cleaner': VacuumCleanerIcon,
  pot: CookingPotIcon,
  'kitchen-utensils': KitchenUtensilsIcon,
  'dish-washer': DishWasherIcon,
  'washing-machine': WashingMachineIcon,
  star: StarIcon,
}

// Every icon sits in a square box exactly `size` wide and tall, with the glyph centred in it.
// Layout aligns the box, never the glyph.
export function Icon({ icon, size = 18, className = '' }: { icon: IconSvgElement; size?: number; className?: string }) {
  return (
    <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} />
    </span>
  )
}

export function IconTile({ icon, tint, size = 32 }: { icon: IconKey; tint: string; size?: number }) {
  return (
    <span className="tile" style={{ width: size, height: size, background: tint }}>
      <Icon icon={ACTIVITY_ICONS[icon.trim().toLowerCase()] ?? StarIcon} size={size / 2} />
    </span>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'neutral' | 'quiet'
  square?: boolean
}

// Press springs back, a ripple starts at the pointer, and solid buttons get a
// light sweep on hover: the three button responses the design system defines.
export function Button({ variant = 'neutral', square, className = '', children, onPointerDown, ...rest }: ButtonProps) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; d: number }[]>([])
  const nextId = useRef(0)
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const id = ++nextId.current
    setRipples((rs) => [...rs, { id, x: e.clientX - r.left, y: e.clientY - r.top, d: Math.max(r.width, r.height) * 2.1 }])
    window.setTimeout(() => setRipples((rs) => rs.filter((v) => v.id !== id)), 560)
    onPointerDown?.(e)
  }
  return (
    <button type="button" className={`btn btn--${variant}${square ? ' btn--square' : ''} ${className}`} onPointerDown={down} {...rest}>
      <span className="btn__label">{children}</span>
      {variant === 'solid' && <span className="btn__sheen" aria-hidden="true" />}
      {ripples.length > 0 && (
        <span className="ripples" aria-hidden="true">
          {ripples.map((v) => (
            <span key={v.id} className="ripple" style={{ left: v.x, top: v.y, width: v.d, height: v.d }} />
          ))}
        </span>
      )}
    </button>
  )
}

type TallyPhase = 'idle' | 'saving' | 'done' | 'count'

// When each phase starts after a tap, in ms. The ring closes during `saving` (see .tally in styles.css).
const TALLY_TIMELINE: [TallyPhase, number][] = [
  ['done', 400],
  ['count', 850],
  ['idle', 1450],
]

// A plus that counts. A tap turns it into a circle showing the count so far while a green ring
// closes around it, a tick lands, the count rolls up by one, and the plus comes back.
// Tapping again part-way adds again and starts over from the new count.
export function TallyButton({ count, onAdd, label }: { count: number; onAdd: () => void; label: string }) {
  const [phase, setPhase] = useState<TallyPhase>('idle')
  const [from, setFrom] = useState(count)
  const [run, setRun] = useState(0)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  const tap = () => {
    timers.current.forEach(window.clearTimeout)
    setFrom(count)
    setRun((n) => n + 1)
    setPhase('saving')
    timers.current = TALLY_TIMELINE.map(([next, at]) => window.setTimeout(() => setPhase(next), at))
    onAdd()
  }

  return (
    <Button variant="solid" square className="tally" data-phase={phase} aria-label={label} onClick={tap}>
      <svg key={run} className="tally__ring" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="21" pathLength={1} />
      </svg>
      <Icon icon={Add01Icon} className="tally__plus" />
      <span className="tally__num tally__num--from" aria-hidden="true">
        {from}
      </span>
      <Icon icon={Tick02Icon} className="tally__check" />
      <span className="tally__num tally__num--to" aria-hidden="true">
        {from + 1}
      </span>
    </Button>
  )
}

// A number that eases to its new value instead of jumping.
export function Count({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value)
  const current = useRef(value)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current = value
      setShown(value)
      return
    }
    const from = current.current
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 420)
      current.current = from + (value - from) * (1 - Math.pow(1 - p, 3))
      setShown(current.current)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <span aria-label={format(value)}>
      <span aria-hidden="true">{format(shown)}</span>
    </span>
  )
}
