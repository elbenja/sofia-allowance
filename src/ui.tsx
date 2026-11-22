import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent } from 'react'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { BedIcon, CookingPotIcon, PawPrintIcon, StarIcon, TShirtIcon, VacuumCleanerIcon } from '@hugeicons/core-free-icons'
import type { IconKey } from './store'

export const ACTIVITY_ICONS: Record<IconKey, IconSvgElement> = {
  bed: BedIcon,
  shirt: TShirtIcon,
  paw: PawPrintIcon,
  vacuum: VacuumCleanerIcon,
  pot: CookingPotIcon,
  star: StarIcon,
}

export function Icon({ icon, size = 18, className }: { icon: IconSvgElement; size?: number; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} className={className} aria-hidden="true" />
}

export function IconTile({ icon, tint, size = 32 }: { icon: IconKey; tint: string; size?: number }) {
  return (
    <span className="tile" style={{ width: size, height: size, background: tint }}>
      <Icon icon={ACTIVITY_ICONS[icon]} size={size / 2} />
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
