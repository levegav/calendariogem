import type { CSSProperties } from 'react'
import styles from './calendar.module.css'
import { shortTime } from './eventText'
import type { CalendarEvent } from './types'

/**
 * Recordatorio en el calendario: línea lateral con el color del CREADOR,
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
      style={{ '--owner-color': event.owner.color, '--category-color': event.category.color } as CSSProperties}
      title={`${event.title} · ${event.category.name} · Creado por: ${event.owner.full_name}`}
      aria-label={`${event.title}, ${time}, ${event.category.name}, creado por ${event.owner.full_name}`}
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
