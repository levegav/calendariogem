import { formatDate, formatLongDate, formatTime, MINUTES_PER_DAY } from '../../lib/dates'
import { eventSpan } from './layout'
import type { CalendarEvent } from './types'

/** Hora corta para las pastillas: "2:30 p. m." o "Todo el día". */
export function shortTime(event: CalendarEvent): string {
  if (event.all_day) return 'Todo el día'
  return formatTime(eventSpan(event).startMinutes)
}

/** Cuándo ocurre, en una frase: "Lunes 16 de noviembre de 2026, 2:00 p. m. – 3:30 p. m." */
export function describeWhen(event: CalendarEvent): string {
  const span = eventSpan(event)
  const sameDay = span.startDate === span.endDate
  if (event.all_day) {
    return sameDay
      ? `${formatLongDate(span.startDate)} · Todo el día`
      : `Del ${formatDate(span.startDate)} al ${formatDate(span.endDate)} · Todo el día`
  }
  const start = formatTime(span.startMinutes)
  if (!event.end_at) return `${formatLongDate(span.startDate)}, ${start}`
  const end = span.endMinutes === MINUTES_PER_DAY ? '12:00 a. m.' : formatTime(span.endMinutes)
  return sameDay
    ? `${formatLongDate(span.startDate)}, ${start} – ${end}`
    : `${formatLongDate(span.startDate)}, ${start} – ${formatLongDate(span.endDate)}, ${end}`
}
