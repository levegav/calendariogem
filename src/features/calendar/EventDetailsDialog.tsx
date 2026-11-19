import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { UserAvatar } from '../../components/UserAvatar'
import { toSpanishMessage } from '../../lib/errors'
import { AlertsPicker } from '../notifications/AlertsPicker'
import { describeWhen } from './eventText'
import { eventMark, GENERAL_NAME } from './general'
import styles from './EventDetailsDialog.module.css'
import { asLink } from './reminderForm'
import type { CalendarEvent } from './types'

/** Detalles de un recordatorio. Solo su creador ve Editar y Eliminar; un etiquetado puede salirse. */
export function EventDetailsDialog({
  event,
  currentUserId,
  onEdit,
  onDelete,
  onLeave,
  onAlertsChange,
  onClose,
}: {
  event: CalendarEvent
  currentUserId: string
  onEdit: () => void
  onDelete: () => Promise<void>
  onLeave: () => Promise<void>
  /** Guarda los avisos previos del usuario en sesión. */
  onAlertsChange: (minutes: number[]) => Promise<void>
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [alerts, setAlerts] = useState(event.my_alerts)
  const [alertsStatus, setAlertsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const isOwner = event.owner.id === currentUserId
  const isParticipant = event.participants.some((p) => p.id === currentUserId)
  const link = event.location ? asLink(event.location) : null

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(toSpanishMessage(err))
      setBusy(false)
    }
  }

  /** Los avisos se guardan al marcarlos; si falla, se vuelve a lo anterior. */
  async function changeAlerts(minutes: number[]) {
    const previous = alerts
    setAlerts(minutes)
    setAlertsStatus('saving')
    try {
      await onAlertsChange(minutes)
      setAlertsStatus('saved')
    } catch {
      setAlerts(previous)
      setAlertsStatus('error')
    }
  }

  function remove() {
    const tagged =
      event.participants.length > 0 ? ' Las personas etiquetadas podrán conservar una copia en su calendario.' : ''
    const general = event.is_general
      ? ' Se quitará del calendario general; los demás con acceso podrán conservar una copia en su calendario personal.'
      : ''
    if (!window.confirm(`¿Eliminar el recordatorio "${event.title}"?${general}${tagged} Esta acción no se puede deshacer.`)) return
    void run(onDelete)
  }

  function leave() {
    if (!window.confirm(`¿Salir del recordatorio "${event.title}"? Dejará de aparecer en su calendario.`)) return
    void run(onLeave)
  }

  const footer = isOwner ? (
    <>
      <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
        {busy ? 'Eliminando…' : 'Eliminar'}
      </button>
      <button type="button" className="btn btn-primary" onClick={onEdit} disabled={busy}>
        Editar
      </button>
    </>
  ) : isParticipant ? (
    <button type="button" className="btn btn-secondary" onClick={leave} disabled={busy}>
      {busy ? 'Saliendo…' : 'Salir del recordatorio'}
    </button>
  ) : undefined

  return (
    <Modal
      title={event.title}
      onClose={onClose}
      accentColor={eventMark(event)}
      footer={footer}

    >
      <div className="stack">
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        <div className={styles.meta}>
          <span className={styles.category} style={{ borderColor: event.category.color }}>
            <span className={styles.dot} style={{ background: event.category.color }} aria-hidden="true" />
            {event.category.name}
          </span>
          {event.is_general && (
            <span className="general-tag">
              <span className="general-mark" aria-hidden="true" />
              {GENERAL_NAME}
            </span>
          )}
          <span className={styles.creator}>
            <span className={styles.creatorLine} style={{ background: event.owner.color }} aria-hidden="true" />
            Creado por: {event.owner.full_name}
          </span>
        </div>

        <dl className={styles.details}>
          <dt>Cuándo</dt>
          <dd>{describeWhen(event)}</dd>

          {event.location && (
            <>
              <dt>Ubicación</dt>
              <dd>
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    {event.location}
                  </a>
                ) : (
                  event.location
                )}
              </dd>
            </>
          )}

          {event.description && (
            <>
              <dt>Descripción</dt>
              <dd className={styles.multiline}>{event.description}</dd>
            </>
          )}

          {event.note && (
            <>
              <dt>Nota</dt>
              <dd className={styles.multiline}>{event.note}</dd>
            </>
          )}

          {event.participants.length > 0 && (
            <>
              <dt>Etiquetados</dt>
              <dd>
                <ul className={styles.people}>
                  {event.participants.map((person) => (
                    <li key={person.id}>
                      <UserAvatar name={person.full_name} color={person.color} size={24} />
                      {person.full_name}
                      {person.id === currentUserId && <span className="muted"> (yo)</span>}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>

        {(isOwner || isParticipant) && (
          <div>
            <AlertsPicker
              allDay={event.all_day}
              selected={alerts}
              onChange={(minutes) => void changeAlerts(minutes)}
              legend="Mis avisos"
              disabled={alertsStatus === 'saving'}
            />
            <p className={styles.alertsStatus} role="status">
              {alertsStatus === 'saving' && 'Guardando…'}
              {alertsStatus === 'saved' && 'Avisos guardados.'}
              {alertsStatus === 'error' && (
                <span className={styles.alertsError}>No se pudieron guardar los avisos. Intente de nuevo.</span>
              )}
            </p>
          </div>
        )}

        {!isOwner && (
          <p className="muted">
            Solo {event.owner.full_name} puede modificar o eliminar este recordatorio.
            {isParticipant && ' Si no le corresponde, puede salirse.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
