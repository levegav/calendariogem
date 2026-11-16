import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { PasswordInput } from '../../components/PasswordInput'
import { toSpanishMessage } from '../../lib/errors'
import { useAuth } from './AuthContext'

export function LoginPage() {
  const { state, signIn } = useAuth()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (state.status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Ingrese su usuario y contraseña.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(username, password)
    } catch (err) {
      setError(toSpanishMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const notice = state.status === 'signedOut' ? state.notice : undefined

  return (
    <div className="auth-page">
      <form className="card auth-card stack" onSubmit={handleSubmit} noValidate>
        <div>
          <img src="/favicon.svg" alt="" width={48} height={48} className="auth-logo" />
          <h1>Calendario GEM</h1>
          <p className="muted">Ingrese con su usuario y contraseña.</p>
        </div>

        {(error ?? notice) && (
          <p className="alert alert-error" role="alert">
            {error ?? notice}
          </p>
        )}

        <label className="field">
          <span>Usuario</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
