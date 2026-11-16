import { addMonths, formatMonthName, monthGrid, sameMonth, startOfYear, WEEKDAY_INITIALS, type DateKey } from '../../lib/dates'
import styles from './calendar.module.css'
import { eventsOnDay } from './layout'
import type { CalendarEvent } from './types'

/** Los 12 meses; los días con recordatorios se marcan y llevan a la vista Día. */
export function YearView({
  date,
  events,
  today,
  onOpenDay,
  onOpenMonth,
}: {
  date: DateKey
  events: CalendarEvent[]
  today: DateKey
  onOpenDay: (date: DateKey) => void
  onOpenMonth: (date: DateKey) => void
}) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfYear(date), i))

  return (
    <div className={styles.year}>
      {months.map((month) => (
        <section key={month} className={styles.miniMonth} aria-label={formatMonthName(month)}>
          <button type="button" className={styles.miniTitle} onClick={() => onOpenMonth(month)}>
            {formatMonthName(month)}
          </button>
          <div className={styles.miniGrid}>
            {WEEKDAY_INITIALS.map((initial, i) => (
              <span key={i} className={styles.miniWeekday}>
                {initial}
              </span>
            ))}
            {monthGrid(month).map((day) => {
              if (!sameMonth(day, month)) return <span key={day} />
              const count = eventsOnDay(events, day).length
              return (
                <button
                  key={day}
                  type="button"
                  className={styles.miniDay}
                  data-today={day === today}
                  data-busy={count > 0}
                  aria-label={`${Number(day.slice(8))} de ${formatMonthName(month).toLowerCase()}${
                    count > 0 ? `, ${count} recordatorio${count === 1 ? '' : 's'}` : ''
                  }`}
                  onClick={() => onOpenDay(day)}
                >
                  {Number(day.slice(8))}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
