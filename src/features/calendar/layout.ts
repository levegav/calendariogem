import {
  addDays,
  addYears,
  MINUTES_PER_DAY,
  monthGrid,
  startOfWeek,
  startOfYear,
  toCostaRica,
  type DateKey,
} from '../../lib/dates'
import type { CalendarEvent, CalendarView } from './types'

/** Duración con la que se dibuja un recordatorio sin hora de fin. */
export const DEFAULT_DURATION = 30
/** Altura mínima (en minutos) de un bloque en la vista por horas, para que se pueda leer y tocar. */
const MIN_BLOCK = 20

/** Días y minutos (Costa Rica) que ocupa un recordatorio. endDate es inclusivo; endMinutes es exclusivo. */
export interface Span {
  startDate: DateKey
  startMinutes: number
  endDate: DateKey
  endMinutes: number
}

export function eventSpan(event: CalendarEvent): Span {
  const start = toCostaRica(event.start_at)
  if (event.all_day) {
    const endDate = event.end_at ? toCostaRica(event.end_at).date : start.date
    return { startDate: start.date, startMinutes: 0, endDate, endMinutes: MINUTES_PER_DAY }
  }
  if (!event.end_at) {
    const endMinutes = Math.min(start.minutes + DEFAULT_DURATION, MINUTES_PER_DAY)
    return { startDate: start.date, startMinutes: start.minutes, endDate: start.date, endMinutes }
  }
  const end = toCostaRica(event.end_at)
  // Termina justo a medianoche: pertenece al día anterior (hasta las 24:00).
  if (end.minutes === 0 && end.date > start.date) {
    return { startDate: start.date, startMinutes: start.minutes, endDate: addDays(end.date, -1), endMinutes: MINUTES_PER_DAY }
  }
  return { startDate: start.date, startMinutes: start.minutes, endDate: end.date, endMinutes: end.minutes }
}

/** Todo el día o de varios días: se muestra en la franja superior, no en la cuadrícula de horas. */
export function isBanner(event: CalendarEvent): boolean {
  const span = eventSpan(event)
  return event.all_day || span.startDate !== span.endDate
}

export function occursOn(event: CalendarEvent, day: DateKey): boolean {
  const span = eventSpan(event)
  return span.startDate <= day && day <= span.endDate
}

/** Recordatorios de un día: primero los de todo el día, luego por hora de inicio. */
export function eventsOnDay(events: CalendarEvent[], day: DateKey): CalendarEvent[] {
  return events
    .filter((event) => occursOn(event, day))
    .sort((a, b) => {
      const [ba, bb] = [isBanner(a), isBanner(b)]
      if (ba !== bb) return ba ? -1 : 1
      return a.start_at.localeCompare(b.start_at) || a.title.localeCompare(b.title)
    })
}

/** Bloque posicionado en la cuadrícula por horas. */
export interface TimedBlock {
  event: CalendarEvent
  start: number
  end: number
  /** Columna dentro de un grupo de recordatorios que se cruzan, y total de columnas del grupo. */
  lane: number
  lanes: number
}

/**
 * Reparte en columnas los recordatorios con hora de un día, para que los que
 * se cruzan queden lado a lado en vez de encimados.
 */
export function layoutTimedEvents(events: CalendarEvent[], day: DateKey): TimedBlock[] {
  const blocks = events
    .filter((event) => !isBanner(event) && occursOn(event, day))
    .map((event) => {
      const span = eventSpan(event)
      return { event, start: span.startMinutes, end: Math.max(span.endMinutes, span.startMinutes + MIN_BLOCK) }
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const result: TimedBlock[] = []
  let group: TimedBlock[] = []
  let laneEnds: number[] = []
  let groupEnd = -1

  const closeGroup = () => {
    for (const block of group) block.lanes = laneEnds.length
    result.push(...group)
    group = []
    laneEnds = []
  }

  for (const { event, start, end } of blocks) {
    if (start >= groupEnd && group.length > 0) closeGroup()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    group.push({ event, start, end, lane, lanes: 0 })
    groupEnd = Math.max(groupEnd, end)
  }
  closeGroup()
  return result
}

/** Días [desde, hasta) que muestra cada vista. */
export function visibleRange(view: CalendarView, date: DateKey): { from: DateKey; to: DateKey } {
  switch (view) {
    case 'dia':
      return { from: date, to: addDays(date, 1) }
    case 'semana':
      return { from: startOfWeek(date), to: addDays(startOfWeek(date), 7) }
    case 'mes': {
      const grid = monthGrid(date)
      return { from: grid[0], to: addDays(grid[grid.length - 1], 1) }
    }
    case 'ano':
      return { from: startOfYear(date), to: startOfYear(addYears(date, 1)) }
  }
}
