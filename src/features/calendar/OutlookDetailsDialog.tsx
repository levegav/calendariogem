import { Modal } from '../../components/Modal'
import { describeWhen } from './eventText'
import styles from './EventDetailsDialog.module.css'
import { OUTLOOK_COLOR, RESPONSE_LABELS, SHOW_AS_LABELS } from './outlook'
import { asLink } from './reminderForm'
import type { CalendarEvent } from './types'

/** Detalles de una reunión traída de Outlook: solo lectura (se cambia desde Outlook). */
export function OutlookDetailsDialog({
  event,
  currentUserId,
  onClose,
}: {
  event: CalendarEvent
  currentUserId: string
  onClose: () => void
}) {
  const info = event.outlook!
  const locationLink = event.location ? asLink(event.location) : null
  const required = info.attendees.filter((a) => !a.optional)
  const optional = info.attendees.filter((a) => a.optional)
  const mine = event.owner.id === currentUserId
  const myResponse = info.my_response && info.my_response !== 'Organizer' ? RESPONSE_LABELS[info.my_response] : null

  return (
    <Modal
      title={event.title}
      onClose={onClose}
      accentColor={OUTLOOK_COLOR}
      footer={
        info.join_url ? (
          <a className="btn btn-primary" href={info.join_url} target="_blank" rel="noopener noreferrer">
            Unirse a la reunión
          </a>
        ) : undefined
      }
    >
      <div className="stack">
        {info.is_cancelled && (
          <p className="alert alert-error" role="status">
            Esta reunión fue cancelada.
          </p>
        )}

        <div className={styles.meta}>
          <span className="outlook-tag">
            <span className="outlook-mark" aria-hidden="true" />
            Reunión de Outlook
          </span>
          {info.is_recurring && <span className="badge">Se repite</span>}
          <span className={styles.creator}>
            <span className={styles.creatorLine} style={{ background: event.owner.color }} aria-hidden="true" />
            Calendario de: {mine ? 'usted' : event.owner.full_name}
          </span>
        </div>

        <dl className={styles.details}>
          <dt>Cuándo</dt>
          <dd>{describeWhen(event)}</dd>

          {event.location && (
            <>
              <dt>Ubicación</dt>
              <dd>
                {locationLink ? (
                  <a href={locationLink} target="_blank" rel="noopener noreferrer">
                    {event.location}
                  </a>
                ) : (
                  event.location
                )}
              </dd>
            </>
          )}

          {info.organizer_name && (
            <>
              <dt>Organizador</dt>
              <dd>
                {info.organizer_name}
                {info.organizer_email && <span className="muted"> · {info.organizer_email}</span>}
              </dd>
            </>
          )}

          {(myResponse || (info.show_as && SHOW_AS_LABELS[info.show_as])) && (
            <>
              <dt>{mine ? 'Mi respuesta' : 'Respuesta'}</dt>
              <dd>
                {[myResponse, info.show_as ? SHOW_AS_LABELS[info.show_as] : null].filter(Boolean).join(' · ')}
              </dd>
            </>
          )}

          {required.length > 0 && (
            <>
              <dt>Asistentes</dt>
              <dd>
                <AttendeeList attendees={required} />
              </dd>
            </>
          )}

          {optional.length > 0 && (
            <>
              <dt>Opcionales</dt>
              <dd>
                <AttendeeList attendees={optional} />
              </dd>
            </>
          )}
        </dl>

        <p className="muted">Viene de Outlook y se actualiza solo. Para cambiarla, hágalo en Outlook.</p>
      </div>
    </Modal>
  )
}

function AttendeeList({ attendees }: { attendees: NonNullable<CalendarEvent['outlook']>['attendees'] }) {
  return (
    <ul className={styles.attendees}>
      {attendees.map((attendee, index) => (
        <li key={`${attendee.email ?? attendee.name}-${index}`}>
          {attendee.name}
          {attendee.response && RESPONSE_LABELS[attendee.response] && (
            <span className="muted"> · {RESPONSE_LABELS[attendee.response]}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
