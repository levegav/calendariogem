import { fromCostaRica, MINUTES_PER_DAY, toCostaRica, todayKey, type DateKey } from '../../lib/dates'
import { defaultAlerts } from '../notifications/alerts'
import type { ReminderPayload } from './api'
import { eventSpan } from './layout'
import type { CalendarEvent } from './types'

export interface ReminderFormValues {
  title: string
  description: string
  categoryId: number | null
  allDay: boolean
  startDate: DateKey
  /** Minutos desde la medianoche (Costa Rica). */
  startTime: number
  hasEnd: boolean
  endDate: DateKey
  endTime: number
  location: string
  note: string
  /** Usuarios etiquetados (sin el creador). */
  participantIds: string[]
  /** Avisos previos del creador (minutos antes). */
  alerts: number[]
}

export type ReminderFormErrors = Partial<Record<'title' | 'categoryId' | 'end' | 'description' | 'location' | 'note', string>>

/** Intervalo de las horas ofrecidas en la lista (como al agendar una reunión). */
export const TIME_STEP = 15
export const TIME_OPTIONS = Array.from({ length: MINUTES_PER_DAY / TIME_STEP }, (_, i) => i * TIME_STEP)

const LIMITS = { title: 150, description: 2000, location: 300, note: 1000 }

/** Próxima hora en punto (hoy) o las 9:00 a. m. (otro día). */
function defaultStartTime(date: DateKey, now: Date): number {
  const current = toCostaRica(now)
  if (date !== current.date) return 9 * 60
  return Math.min(Math.ceil((current.minutes + 1) / 60) * 60, 23 * 60)
}

/** Valores de un recordatorio nuevo; la fecha y hora pueden venir de la casilla en la que se hizo clic. */
export function newReminderValues(
  options: { date?: DateKey; minutes?: number; categoryId?: number | null } = {},
  now: Date = new Date(),
): ReminderFormValues {
  const startDate = options.date ?? todayKey(now)
  const startTime = options.minutes ?? defaultStartTime(startDate, now)
  const endTime = Math.min(startTime + 60, MINUTES_PER_DAY - TIME_STEP)
  return {
    title: '',
    description: '',
    categoryId: options.categoryId ?? null,
    allDay: false,
    startDate,
    startTime,
    hasEnd: false,
    endDate: startDate,
    endTime,
    location: '',
    note: '',
    participantIds: [],
    alerts: defaultAlerts(false),
  }
}

export function valuesFromEvent(event: CalendarEvent): ReminderFormValues {
  const span = eventSpan(event)
  const end = event.end_at ? toCostaRica(event.end_at) : null
  return {
    title: event.title,
    description: event.description ?? '',
    categoryId: event.category.id,
    allDay: event.all_day,
    startDate: span.startDate,
    startTime: span.startMinutes,
    hasEnd: event.end_at !== null,
    endDate: event.all_day ? span.endDate : (end?.date ?? span.startDate),
    endTime: end?.minutes ?? Math.min(span.startMinutes + 60, MINUTES_PER_DAY - TIME_STEP),
    location: event.location ?? '',
    note: event.note ?? '',
    participantIds: event.participants.map((p) => p.id),
    alerts: event.my_alerts,
  }
}

function startInstant(values: ReminderFormValues): string {
  return fromCostaRica(values.startDate, values.allDay ? 0 : values.startTime)
}

function endInstant(values: ReminderFormValues): string | null {
  if (!values.hasEnd) return null
  return fromCostaRica(values.endDate, values.allDay ? 0 : values.endTime)
}

export function validateReminder(values: ReminderFormValues): ReminderFormErrors {
  const errors: ReminderFormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'Escriba un título.'
  else if (title.length > LIMITS.title) errors.title = `El título no puede superar ${LIMITS.title} caracteres.`
  if (values.categoryId === null) errors.categoryId = 'Elija una categoría.'
  if (values.hasEnd) {
    const end = endInstant(values)!
    if (end < startInstant(values)) {
      errors.end = values.allDay
        ? 'La fecha de finalización no puede ser anterior a la de inicio.'
        : 'La finalización no puede ser anterior al inicio.'
    }
  }
  if (values.description.trim().length > LIMITS.description) {
    errors.description = `La descripción no puede superar ${LIMITS.description} caracteres.`
  }
  if (values.location.trim().length > LIMITS.location) {
    errors.location = `La ubicación no puede superar ${LIMITS.location} caracteres.`
  }
  if (values.note.trim().length > LIMITS.note) errors.note = `La nota no puede superar ${LIMITS.note} caracteres.`
  return errors
}

const optional = (text: string) => text.trim() || null

export function toPayload(values: ReminderFormValues): ReminderPayload {
  return {
    title: values.title.trim(),
    description: optional(values.description),
    start_at: startInstant(values),
    end_at: endInstant(values),
    all_day: values.allDay,
    category_id: values.categoryId!,
    location: optional(values.location),
    note: optional(values.note),
    participant_ids: [...new Set(values.participantIds)],
    alerts: [...new Set(values.alerts)].sort((a, b) => a - b),
  }
}

/** Una ubicación que parece enlace se muestra como vínculo (p. ej. reuniones de Teams o Meet). */
export function asLink(location: string): string | null {
  const text = location.trim()
  if (/^https?:\/\/\S+$/i.test(text)) return text
  if (/^www\.\S+\.\S+$/i.test(text)) return `https://${text}`
  return null
}
