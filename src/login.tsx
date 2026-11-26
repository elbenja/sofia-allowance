import { StrictMode, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './styles.css'
import './login.css'
import DogAvatar, { type DogHandle } from './DogAvatar'
import { TITLE } from './kid'
import { Button } from './ui'

function Login() {
  const dog = useRef<DogHandle>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null)
    if (res?.ok) {
      dog.current?.react('euphoric', 1400)
      window.setTimeout(() => window.location.replace('/'), 900)
      return
    }
    setBusy(false)
    setPassword('')
    setShake((n) => n + 1)
    dog.current?.react('sad', 1800)
    setError(res?.status === 401 ? 'That password does not match.' : 'Could not check the password. Try again.')
  }

  return (
    <main className="login">
      <div className="login__wrap">
        <DogAvatar ref={dog} />
        <form className="card login__card" onSubmit={submit}>
          <div className="login__head">
            <h1>{TITLE}</h1>
            <span className="hint">Enter the family password to continue.</span>
          </div>
          <input
            key={shake}
            className={`field login__field${shake ? ' field--shake' : ''}`}
            type="password"
            autoComplete="current-password"
            autoFocus
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => dog.current?.react('curious', 1200)}
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && (
            <span id="login-error" role="alert" className="form-error">
              {error}
            </span>
          )}
          <Button variant="solid" type="submit" disabled={!password || busy}>
            {busy ? 'Opening…' : 'Open'}
          </Button>
        </form>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Login />
  </StrictMode>,
)
