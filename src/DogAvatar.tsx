import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { DogReaction } from './dog'

export interface DogHandle {
  react(name: DogReaction, ms?: number): void
}

// The 3D goldendoodle peeking over the tips card. three.js is loaded only after the
// dashboard is on screen, and the dog fades in once its first frame is drawn.
// Devices without WebGL2 simply show no dog.
const DogAvatar = forwardRef<DogHandle>(function DogAvatar(_, ref) {
  const host = useRef<HTMLDivElement>(null)
  const dog = useRef<ReturnType<typeof import('./dog').mountDog> | null>(null)
  const [ready, setReady] = useState(false)

  useImperativeHandle(ref, () => ({ react: (name, ms) => dog.current?.react(name, ms) }), [])

  useEffect(() => {
    let cancelled = false
    import('./dog')
      .then(({ mountDog }) => {
        if (cancelled || !host.current) return
        dog.current = mountDog(host.current, () => setReady(true))
      })
      .catch(() => {}) // no WebGL2: no dog
    return () => {
      cancelled = true
      dog.current?.dispose()
      dog.current = null
    }
  }, [])

  return (
    <div className="dog" aria-hidden="true">
      <div ref={host} className={`dog__stage${ready ? ' dog__stage--ready' : ''}`} />
    </div>
  )
})

export default DogAvatar
