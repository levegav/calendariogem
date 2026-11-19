import { useState, type FormEvent } from 'react'
import { ColorPicker } from '../../components/ColorPicker'
import type { UserRole } from '../../lib/auth'
import { isColorAvailable } from '../../lib/colors'
import { toSpanishMessage } from '../../lib/errors'
import type { Profile } from '../auth/AuthContext'
import { updateUser } from './api'
import { GeneralAccessField } from './GeneralAccessField'
import { RoleSelect } from './RoleSelect'

export function EditUserForm({
  user,
  users,
  isSelf,
  onSaved,
  onCancel,
}: {
  user: Profile
  users: Profile[]
  isSelf: boolean
  onSaved: () => void
  onCancel: () => void
}) {
  const [fullName, setFullName] = useState(user.full_name)
  const [role, setRole] = useState<UserRole>(user.role)
  const [color, setColor] = useState(user.color)
  const [generalAccess, setGeneralAccess] = useState(user.general_access)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!fullName.trim()) {
      setError('Ingrese el nombre completo.')
      return
    }
    if (!isColorAvailable(color, users, user.id)) {
      setError('Elija un color que no use otro usuario.')
      return
    }
    setSubmitting(true)
    try {
      await updateUser({
        id: user.id,
        full_name: fullName.trim(),
        role,
        active: user.active,
        color,
        general_access: generalAccess,
      })
      onSaved()
    } catch (err) {
      setError(toSpanishMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        <span>Nombre completo</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>
      <RoleSelect value={role} onChange={setRole} disabled={isSelf} />
      {isSelf && <small className="muted">No puede cambiar su propio rol.</small>}
      <GeneralAccessField checked={generalAccess} onChange={setGeneralAccess} />
      <ColorPicker value={color} onChange={setColor} users={users} excludeId={user.id} />
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
