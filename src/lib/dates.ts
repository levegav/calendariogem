/**
 * Fechas del calendario, siempre en hora de Costa Rica, sin importar la zona
 * horaria del dispositivo. Costa Rica no usa horario de verano: UTC−6 todo el
 * año (las pruebas lo comparan con la base de datos de zonas de Intl).
 *
 * Un día del calendario se representa como texto "AAAA-MM-DD" (DateKey) y la
 * hora como minutos desde la medianoche (0–1439). Así la aritmética de fechas
 * no depende del reloj ni de la zona del navegador.
 */

export const TIME_ZONE = 'America/Costa_Rica'
const OFFSET_MINUTES = -6 * 60
const LOCALE = 'es-CR'

export type DateKey = string

export const MINUTES_PER_DAY = 24 * 60

function keyToUtc(key: DateKey): Date {
  return new Date(`${key}T00:00:00Z`)
}

function utcToKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10)
}

export function isDateKey(value: unknown): value is DateKey {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(keyToUtc(value).getTime())
    && utcToKey(keyToUtc(value)) === value
}

/** Día y minutos en Costa Rica de un instante. */
export function toCostaRica(instant: string | Date): { date: DateKey; minutes: number } {
  const time = typeof instant === 'string' ? new Date(instant).getTime() : instant.getTime()
  const shifted = new Date(time + OFFSET_MINUTES * 60_000)
  return {
    date: utcToKey(shifted),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

/** Instante (ISO, UTC) de un día y hora de Costa Rica. */
export function fromCostaRica(date: DateKey, minutes = 0): string {
  return new Date(keyToUtc(date).getTime() + (minutes - OFFSET_MINUTES) * 60_000).toISOString()
}

export function todayKey(now: Date = new Date()): DateKey {
  return toCostaRica(now).date
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = keyToUtc(key)
  date.setUTCDate(date.getUTCDate() + days)
  return utcToKey(date)
}

/** Suma meses; si el día no existe en el mes destino, usa el último (31 ene + 1 mes = 28/29 feb). */
export function addMonths(key: DateKey, months: number): DateKey {
  const date = keyToUtc(key)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = daysInMonth(date.getUTCFullYear(), date.getUTCMonth())
  date.setUTCDate(Math.min(day, lastDay))
  return utcToKey(date)
}

export function addYears(key: DateKey, years: number): DateKey {
  return addMonths(key, years * 12)
}

/** Días del mes (mes 0–11). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Día de la semana con el lunes primero: 0 = lunes … 6 = domingo. */
export function weekday(key: DateKey): number {
  return (keyToUtc(key).getUTCDay() + 6) % 7
}

export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekday(key))
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`
}

export function startOfYear(key: DateKey): DateKey {
  return `${key.slice(0, 4)}-01-01`
}

/** Los 7 días de la semana (lunes a domingo) que contiene la fecha. */
export function weekDays(key: DateKey): DateKey[] {
  const monday = startOfWeek(key)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Cuadrícula del mes: 6 semanas completas (42 días) empezando en lunes. */
export function monthGrid(key: DateKey): DateKey[] {
  const first = startOfWeek(startOfMonth(key))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

export function sameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** Diferencia en días (b − a). */
export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((keyToUtc(b).getTime() - keyToUtc(a).getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Textos (español de Costa Rica)
// ---------------------------------------------------------------------------

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function format(key: DateKey, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(keyToUtc(key))
}

/** "Lunes 16 de noviembre de 2026" */
export function formatLongDate(key: DateKey): string {
  return capitalize(format(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', ''))
}

/** "16 de noviembre de 2026" */
export function formatDate(key: DateKey): string {
  return format(key, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "Noviembre 2026" */
export function formatMonthYear(key: DateKey): string {
  return capitalize(`${format(key, { month: 'long' })} ${key.slice(0, 4)}`)
}

/** "Noviembre" */
export function formatMonthName(key: DateKey): string {
  return capitalize(format(key, { month: 'long' }))
}

/** "16 – 22 nov 2026" o "30 nov – 6 dic 2026" */
export function formatWeekRange(key: DateKey): string {
  const [first, last] = [startOfWeek(key), addDays(startOfWeek(key), 6)]
  const short = (k: DateKey) => format(k, { month: 'short' }).replace('.', '')
  const day = (k: DateKey) => Number(k.slice(8, 10))
  if (first.slice(0, 4) !== last.slice(0, 4)) {
    return `${day(first)} ${short(first)} ${first.slice(0, 4)} – ${day(last)} ${short(last)} ${last.slice(0, 4)}`
  }
  if (sameMonth(first, last)) return `${day(first)} – ${day(last)} ${short(last)} ${last.slice(0, 4)}`
  return `${day(first)} ${short(first)} – ${day(last)} ${short(last)} ${last.slice(0, 4)}`
}

/** Iniciales de los días: ["L", "K", "M", "J", "V", "S", "D"] (K = martes, como en Costa Rica). */
export const WEEKDAY_INITIALS = ['L', 'K', 'M', 'J', 'V', 'S', 'D']

/** Nombres cortos: ["lun", "mar", …]. */
export const WEEKDAY_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** "2:30 p. m." */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const suffix = h < 12 ? 'a. m.' : 'p. m.'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** "14:30" para campos de hora. */
export function minutesToHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [h, m] = [Number(match[1]), Number(match[2])]
  return h < 24 && m < 60 ? h * 60 + m : null
}

/**
 * Interpreta una hora escrita a mano: "10:03", "10:03 a. m.", "10:03am",
 * "3pm", "3 p", "15:20", "1003". Sin a. m./p. m. se toma en formato de 24 h.
 * Devuelve minutos desde la medianoche, o null si no es una hora válida.
 */
export function parseTime(text: string): number | null {
  const clean = text
    .toLowerCase()
    .replace(/[\s.]/g, '')
    .replace(/(a|p)m$/, '$1')
  const match = /^(\d{1,2})(?::(\d{2}))?(a|p)?$/.exec(clean) ?? /^(\d{1,2})(\d{2})(a|p)?$/.exec(clean)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = match[2] === undefined ? 0 : Number(match[2])
  const half = match[3]
  if (minutes > 59) return null
  if (half) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (half === 'p' ? 12 : 0)
  } else if (hours > 23) {
    return null
  }
  return hours * 60 + minutes
}
