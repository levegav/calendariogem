import { useState, type FormEvent } from 'react'
import { ColorPicker } from '../../components/ColorPicker'
import {
  generateTemporaryPassword,
  normalizeUsername,
  USERNAME_PATTERN,
  validatePassword,
  type UserRole,
} from '../../lib/auth'
import { isColorAvailable, suggestColor } from '../../lib/colors'
import { toSpanishMessage } from '../../lib/errors'
import type { Profile } from '../auth/AuthContext'
import { createUser } from './api'
import { RoleSelect } from './RoleSelect'

export interface Credentials {
  username: string
  password: string
}

export function CreateUserForm({
  users,
  onCreated,
  onCancel,
}: {
  users: Profile[]
  onCreated: (credentials: Credentials) => void
  onCancel: () => void
}) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [color, setColor] = useState(() => suggestColor(users.map((u) => u.color)))
  const [password, setPassword] = useState(generateTemporaryPassword)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const normalized = normalizeUsername(username)
    if (!USERNAME_PATTERN.test(normalized)) {
      setError('El usuario debe tener de 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.')
      return
    }
    if (!fullName.trim()) {
      setError('Ingrese el nombre completo.')
      return
    }
    if (!isColorAvailable(color, users)) {
      setError('Elija un color que no use otro usuario.')
      return
    }
    const passwordProblem = validatePassword(password)
    if (passwordProblem) {
      setError(passwordProblem)
      return
    }

    setSubmitting(true)
    try {
      await createUser({ username: normalized, full_name: fullName.trim(), role, color, password })
      onCreated({ username: normalized, password })
    } catch (err) {
      setError(toSpanishMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit} noValidate>
      <h2>Nuevo usuario</h2>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label className="field">
          <span>Usuario</span>
          <input
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ej. maria.perez"
          />
        </label>
        <small className="muted">Con este nombre iniciará sesión. Sin espacios ni tildes.</small>
      </div>
      <label className="field">
        <span>Nombre completo</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" />
      </label>
      <RoleSelect value={role} onChange={setRole} />
      <ColorPicker value={color} onChange={setColor} users={users} />
      <div className="field">
        <div className="input-row">
          <label className="field">
            <span>Contraseña temporal</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => setPassword(generateTemporaryPassword())}>
            Generar otra
          </button>
        </div>
        <small className="muted">El usuario deberá cambiarla en su primer ingreso.</small>
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear usuario'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
