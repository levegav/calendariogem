import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { PasswordInput } from '../../components/PasswordInput'
import { validatePassword } from '../../lib/auth'
import { toSpanishMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthContext'

export function ChangePasswordPage() {
  const { state, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const mustChange = state.status === 'signedIn' && state.profile.must_change_password

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const problem = validatePassword(password)
    if (problem) {
      setError(problem)
      return
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      const { error: rpcError } = await supabase.rpc('complete_password_change')
      if (rpcError) throw rpcError
      await refreshProfile()
      // Vuelve al inicio; el aviso de éxito lo muestra AppLayout.
      void navigate('/', { replace: true, state: { notice: 'Contraseña actualizada correctamente.' } })
    } catch (err) {
      setError(toSpanishMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <section className="narrow stack">
      <h1>Cambiar contraseña</h1>

      {mustChange && (
        <p className="alert alert-info">
          Por seguridad, cambie la contraseña temporal antes de continuar.
        </p>
      )}
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <form className="card stack" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field">
            <span>Nueva contraseña</span>
            <PasswordInput
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <small className="muted">Mínimo 8 caracteres, con letras y números.</small>
        </div>
        <label className="field">
          <span>Repita la nueva contraseña</span>
          <PasswordInput
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </section>
  )
}
