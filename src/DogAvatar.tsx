import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import puppyUrl from './assets/puppy.png'
import type { DogReaction } from './dog'

export interface DogHandle {
  react(name: DogReaction, ms?: number): void
}

// The 3D goldendoodle peeking over the tips card. three.js is loaded only after the
// dashboard is on screen; until the first frame is drawn, and on devices without
// WebGL2, the still puppy picture stands in its place.
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
        const bg = getComputedStyle(document.body).backgroundColor
        dog.current = mountDog(host.current, bg, () => setReady(true))
      })
      .catch(() => {}) // no WebGL2: the picture stays
    return () => {
      cancelled = true
      dog.current?.dispose()
      dog.current = null
    }
  }, [])

  return (
    <div className="dog" aria-hidden="true">
      <div ref={host} className={`dog__stage${ready ? ' dog__stage--ready' : ''}`} />
      {!ready && <img className="dog__poster" src={puppyUrl} alt="" />}
    </div>
  )
})

export default DogAvatar
