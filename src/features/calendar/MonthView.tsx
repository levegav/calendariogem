import { monthGrid, sameMonth, WEEKDAY_SHORT, type DateKey } from '../../lib/dates'
import styles from './calendar.module.css'
import { EventChip } from './EventChip'
import { eventsOnDay } from './layout'
import type { CalendarEvent } from './types'

/** Cuántos recordatorios caben en una casilla antes de mostrar "+N más". */
const VISIBLE_PER_DAY = 3

export function MonthView({
  date,
  events,
  today,
  onCreate,
  onOpen,
  onOpenDay,
}: {
  date: DateKey
  events: CalendarEvent[]
  today: DateKey
  onCreate: (date: DateKey) => void
  onOpen: (event: CalendarEvent) => void
  onOpenDay: (date: DateKey) => void
}) {
  const days = monthGrid(date)

  return (
    <div className={styles.month}>
      <div className={styles.monthHeader}>
        {WEEKDAY_SHORT.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {days.map((day) => {
          const list = eventsOnDay(events, day)
          const hidden = list.length - VISIBLE_PER_DAY
          return (
            <div
              key={day}
              className={styles.monthCell}
              data-outside={!sameMonth(day, date)}
              onClick={(event) => {
                if (event.target === event.currentTarget) onCreate(day)
              }}
              role="presentation"
            >
              <button
                type="button"
                className={styles.monthDay}
                data-today={day === today}
                aria-label={`Ver el día ${Number(day.slice(8))}`}
                onClick={() => onOpenDay(day)}
              >
                {Number(day.slice(8))}
              </button>
              {list.slice(0, hidden > 0 ? VISIBLE_PER_DAY - 1 : VISIBLE_PER_DAY).map((event) => (
                <EventChip key={event.id} event={event} onOpen={onOpen} />
              ))}
              {hidden > 0 && (
                <button type="button" className={styles.more} onClick={() => onOpenDay(day)}>
                  +{hidden + 1} más
                </button>
              )}
              {/* En celular las pastillas no caben: se muestran puntos con el color del creador. */}
              {list.length > 0 && (
                <span className={styles.dots} aria-hidden="true">
                  {list.slice(0, 4).map((event) => (
                    <span key={event.id} style={{ background: event.owner.color }} />
                  ))}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
