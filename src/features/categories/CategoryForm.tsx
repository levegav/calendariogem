import { useState, type FormEvent } from 'react'
import { ColorPicker } from '../../components/ColorPicker'
import { toSpanishMessage } from '../../lib/errors'

/** Formulario de nombre y color de una categoría (crear o editar). */
export function CategoryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; color: string }
  submitLabel: string
  onSubmit: (values: { name: string; color: string }) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
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
      await onSubmit({ name: trimmed, color })
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
