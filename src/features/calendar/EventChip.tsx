import styles from './calendar.module.css'
import { shortTime } from './eventText'
import { eventOrigin, eventStyle } from './general'
import type { CalendarEvent } from './types'

/**
 * Recordatorio en el calendario: línea lateral con el color del CREADOR (o el
 * arcoíris si está en el calendario general),
 * punto con el color de la CATEGORÍA, título y hora.
 */
export function EventChip({
  event,
  onOpen,
  showTime = true,
  showCreator = false,
}: {
  event: CalendarEvent
  onOpen: (event: CalendarEvent) => void
  showTime?: boolean
  showCreator?: boolean
}) {
  const time = shortTime(event)
  return (
    <button
      type="button"
      className={styles.chip}
      style={eventStyle(event)}
      data-general={event.is_general || undefined}
      title={`${event.title} · ${event.category.name} · ${eventOrigin(event, ' · ')}`}
      aria-label={`${event.title}, ${time}, ${event.category.name}, ${eventOrigin(event)}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(event)
      }}
    >
      <span className={styles.chipDot} aria-hidden="true" />
      {showTime && !event.all_day && <span className={styles.chipTime}>{time}</span>}
      <span className={styles.chipTitle}>{event.title}</span>
      {showCreator && <span className={styles.chipCreator}>Creado por: {event.owner.full_name}</span>}
    </button>
  )
}
