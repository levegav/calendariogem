import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { UserAvatar } from '../../components/UserAvatar'
import { Modal } from '../../components/Modal'
import { formatTime, isDateKey } from '../../lib/dates'
import { toSpanishMessage } from '../../lib/errors'
import type { Category } from '../categories/api'
import type { ReminderPayload } from './api'
import {
  TIME_OPTIONS,
  toPayload,
  validateReminder,
  type ReminderFormErrors,
  type ReminderFormValues,
} from './reminderForm'
import styles from './ReminderFormDialog.module.css'
import type { Person } from './types'

function TimeSelect({ label, value, onChange }: { label: string; value: number; onChange: (minutes: number) => void }) {
  // Si la hora guardada no cae en la lista (p. ej. 9:05), se agrega para no perderla.
  const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort((a, b) => a - b)
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((minutes) => (
          <option key={minutes} value={minutes}>
            {formatTime(minutes)}
          </option>
        ))}
      </select>
    </label>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <small id={id} className={styles.error}>
      {message}
    </small>
  ) : null
}

/** Con más personas que esto aparece un campo para buscarlas por nombre. */
const SEARCH_FROM = 8

function ParticipantsPicker({
  people,
  selected,
  onChange,
}: {
  people: Person[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const visible = query.trim()
    ? people.filter((p) => selected.includes(p.id) || normalized(p.full_name).includes(normalized(query.trim())))
    : people

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }

  return (
    <fieldset className={styles.categories}>
      <legend>
        Etiquetar personas <small className="muted">(opcional)</small>
      </legend>
      {people.length === 0 ? (
        <p className="muted">No hay otros usuarios activos para etiquetar.</p>
      ) : (
        <>
          {people.length > SEARCH_FROM && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar personas para etiquetar"
            />
          )}
          <div className={styles.chips}>
            {visible.map((person) => {
              const checked = selected.includes(person.id)
              return (
                <label
                  key={person.id}
                  className={`${styles.chip} ${styles.personChip} ${checked ? styles.chipSelected : ''}`}
                  style={{ '--chip-color': person.color } as CSSProperties}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(person.id)} />
                  <UserAvatar name={person.full_name} color={person.color} size={26} />
                  {person.full_name}
                </label>
              )
            })}
          </div>
          {selected.length > 0 && (
            <small className="muted">
              {selected.length === 1 ? '1 persona etiquetada' : `${selected.length} personas etiquetadas`}. Verán este
              recordatorio en su calendario.
            </small>
          )}
        </>
      )}
    </fieldset>
  )
}

export function ReminderFormDialog({
  mode,
  initialValues,
  categories,
  people,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit'
  initialValues: ReminderFormValues
  /** Categorías que se pueden elegir (activas y, al editar, la que ya tenía). */
  categories: Category[]
  /** Personas que se pueden etiquetar (sin el creador). */
  people: Person[]
  onSave: (payload: ReminderPayload) => Promise<void>
  onClose: () => void
}) {
  const id = useId()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<ReminderFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ReminderFormValues>(key: K, value: ReminderFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      // Al mover el inicio, la finalización se mueve con él si quedaba antes.
      if (key === 'startDate' && next.endDate < next.startDate) next.endDate = next.startDate
      if (key === 'startTime' && next.endDate === next.startDate && next.endTime <= next.startTime) {
        next.endTime = Math.min(next.startTime + 60, 23 * 60 + 45)
      }
      return next
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaveError(null)
    const found = validateReminder(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onSave(toPayload(values))
    } catch (err) {
      setSaveError(toSpanishMessage(err))
      setSaving(false)
    }
  }

  const formId = `${id}-form`

  return (
    <Modal
      title={mode === 'create' ? 'Nuevo recordatorio' : 'Editar recordatorio'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : mode === 'create' ? 'Crear recordatorio' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={handleSubmit} noValidate>
        {saveError && (
          <p className="alert alert-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="field">
          <label className="field">
            <span>Título</span>
            <input
              data-autofocus
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={150}
              placeholder="ej. Reunión de planificación"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${id}-title` : undefined}
            />
          </label>
          <FieldError id={`${id}-title`} message={errors.title} />
        </div>

        <fieldset className={styles.categories} aria-describedby={errors.categoryId ? `${id}-cat` : undefined}>
          <legend>Categoría</legend>
          <div className={styles.chips}>
            {categories.map((category) => (
              <label
                key={category.id}
                className={`${styles.chip} ${values.categoryId === category.id ? styles.chipSelected : ''}`}
                style={{ '--chip-color': category.color } as CSSProperties}
              >
                <input
                  type="radio"
                  name={`${id}-categoria`}
                  checked={values.categoryId === category.id}
                  onChange={() => set('categoryId', category.id)}
                />
                <span className={styles.chipDot} aria-hidden="true" />
                {category.name}
                {!category.active && <small className="muted"> (desactivada)</small>}
              </label>
            ))}
          </div>
          <FieldError id={`${id}-cat`} message={errors.categoryId} />
        </fieldset>

        <label className={styles.switch}>
          <input type="checkbox" checked={values.allDay} onChange={(e) => set('allDay', e.target.checked)} />
          Todo el día
        </label>

        <div className={styles.row}>
          <label className="field">
            <span>{values.allDay ? 'Fecha' : 'Fecha de inicio'}</span>
            <input
              type="date"
              value={values.startDate}
              required
              onChange={(e) => isDateKey(e.target.value) && set('startDate', e.target.value)}
            />
          </label>
          {!values.allDay && <TimeSelect label="Hora de inicio" value={values.startTime} onChange={(m) => set('startTime', m)} />}
        </div>

        <label className={styles.switch}>
          <input type="checkbox" checked={values.hasEnd} onChange={(e) => set('hasEnd', e.target.checked)} />
          {values.allDay ? 'Dura varios días' : 'Agregar fecha y hora de finalización'}
        </label>

        {values.hasEnd && (
          <div className="field">
            <div className={styles.row}>
              <label className="field">
                <span>{values.allDay ? 'Hasta el' : 'Fecha de finalización'}</span>
                <input
                  type="date"
                  value={values.endDate}
                  min={values.startDate}
                  onChange={(e) => isDateKey(e.target.value) && set('endDate', e.target.value)}
                  aria-invalid={Boolean(errors.end)}
                  aria-describedby={errors.end ? `${id}-end` : undefined}
                />
              </label>
              {!values.allDay && (
                <TimeSelect label="Hora de finalización" value={values.endTime} onChange={(m) => set('endTime', m)} />
              )}
            </div>
            <FieldError id={`${id}-end`} message={errors.end} />
          </div>
        )}

        <ParticipantsPicker people={people} selected={values.participantIds} onChange={(ids) => set('participantIds', ids)} />

        <div className="field">
          <label className="field">
            <span>
              Descripción <small className="muted">(opcional)</small>
            </span>
            <textarea rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
          </label>
          <FieldError id={`${id}-desc`} message={errors.description} />
        </div>

        <div className="field">
          <label className="field">
            <span>
              Ubicación o enlace <small className="muted">(opcional)</small>
            </span>
            <input
              value={values.location}
              onChange={(e) => set('location', e.target.value)}
              maxLength={300}
              placeholder="ej. Sala 2 o https://meet.google.com/…"
            />
          </label>
          <FieldError id={`${id}-loc`} message={errors.location} />
        </div>

        <div className="field">
          <label className="field">
            <span>
              Nota <small className="muted">(opcional)</small>
            </span>
            <textarea rows={2} value={values.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />
          </label>
          <FieldError id={`${id}-note`} message={errors.note} />
        </div>
      </form>
    </Modal>
  )
}
