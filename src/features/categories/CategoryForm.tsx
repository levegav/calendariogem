import { useState, type FormEvent } from 'react'
import { ColorPicker } from '../../components/ColorPicker'
import { toSpanishMessage } from '../../lib/errors'

/** Formulario de nombre, color y uso de una categoría (crear o editar). */
export function CategoryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; color: string; personal_only: boolean }
  submitLabel: string
  onSubmit: (values: { name: string; color: string; personal_only: boolean }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
  const [personalOnly, setPersonalOnly] = useState(initial.personal_only)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Ingrese el nombre de la categoría.')
      return
    }
    if (trimmed.length > 40) {
      setError('El nombre no puede superar 40 caracteres.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ name: trimmed, color, personal_only: personalOnly })
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
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" />
      </label>
      {/* Las categorías pueden compartir color; no hay restricción de uso. */}
      <ColorPicker value={color} onChange={setColor} users={[]} legend="Color de la categoría" />
      <label className="check-row">
        <input type="checkbox" checked={personalOnly} onChange={(e) => setPersonalOnly(e.target.checked)} />
        <span>
          <span className="check-row-title">Solo para calendarios personales</span>
          <small className="muted">No se podrá usar en el calendario general (por ejemplo, "Personal").</small>
        </span>
      </label>
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
