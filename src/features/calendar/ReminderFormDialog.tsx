import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { UserAvatar } from '../../components/UserAvatar'
import { Modal } from '../../components/Modal'
import { formatTime, isDateKey } from '../../lib/dates'
import { toSpanishMessage } from '../../lib/errors'
import type { Category } from '../categories/api'
import { defaultAlerts } from '../notifications/alerts'
import { AlertsPicker } from '../notifications/AlertsPicker'
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

/** Cuántas coincidencias se muestran como máximo al buscar. */
const MAX_RESULTS = 6

const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Etiquetar personas: se busca por nombre y se agregan como pastillas que se pueden quitar. */
function ParticipantsPicker({
  people,
  selected,
  onChange,
}: {
  people: Person[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const term = normalized(query.trim())
  const chosen = selected.map((sid) => people.find((p) => p.id === sid)).filter((p): p is Person => Boolean(p))
  const matches = term
    ? people
        .filter((p) => !selected.includes(p.id) && normalized(p.full_name).split(/\s+/).some((w) => w.startsWith(term)))
        .concat(
          people.filter(
            (p) =>
              !selected.includes(p.id) &&
              !normalized(p.full_name).split(/\s+/).some((w) => w.startsWith(term)) &&
              normalized(p.full_name).includes(term),
          ),
        )
        .slice(0, MAX_RESULTS)
    : []

  function add(person: Person) {
    onChange([...selected, person.id])
    setQuery('')
  }

  return (
    <div className="field">
      <label className="field">
        <span>
          Etiquetar personas <small className="muted">(opcional)</small>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter agrega la primera coincidencia en vez de enviar el formulario.
            if (e.key === 'Enter') {
              e.preventDefault()
              if (matches[0]) add(matches[0])
            }
          }}
          placeholder="Escriba un nombre para buscar"
          autoComplete="off"
          aria-describedby={`${id}-ayuda`}
        />
      </label>

      {term && (
        <ul className={styles.results} aria-label="Resultados de la búsqueda">
          {matches.length === 0 ? (
            <li className="muted">No se encontró a nadie con ese nombre.</li>
          ) : (
            matches.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className={styles.result}
                  aria-label={`Etiquetar a ${person.full_name}`}
                  onClick={() => add(person)}
                >
                  <UserAvatar name={person.full_name} color={person.color} size={26} />
                  {person.full_name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {chosen.length > 0 && (
        <ul className={styles.tagged} aria-label="Personas etiquetadas">
          {chosen.map((person) => (
            <li key={person.id} className={styles.taggedChip} style={{ '--chip-color': person.color } as CSSProperties}>
              <UserAvatar name={person.full_name} color={person.color} size={24} />
              {person.full_name}
              <button
                type="button"
                className={styles.untag}
                aria-label={`Quitar a ${person.full_name}`}
                title={`Quitar a ${person.full_name}`}
                onClick={() => onChange(selected.filter((s) => s !== person.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <small id={`${id}-ayuda`} className="muted">
        {chosen.length === 0
          ? 'Las personas etiquetadas verán este recordatorio en su calendario.'
          : `${chosen.length === 1 ? '1 persona etiquetada' : `${chosen.length} personas etiquetadas`}. Verán este recordatorio en su calendario.`}
      </small>
    </div>
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
      // Las opciones de aviso cambian entre "todo el día" y con hora: vuelve al de por defecto.
      if (key === 'allDay' && next.allDay !== prev.allDay) next.alerts = defaultAlerts(next.allDay)
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

        <AlertsPicker allDay={values.allDay} selected={values.alerts} onChange={(m) => set('alerts', m)} legend="Mis avisos" />

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
