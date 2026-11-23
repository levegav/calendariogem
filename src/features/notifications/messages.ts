import { formatTime, toCostaRica, WEEKDAY_SHORT, weekday, type DateKey } from '../../lib/dates'
import { alertMoment } from './alerts'
import type { AppNotification, ChangedField } from './types'

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

/** "mié 18 nov" */
function shortDate(key: DateKey): string {
  return `${WEEKDAY_SHORT[weekday(key)]} ${Number(key.slice(8, 10))} ${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]}`
}

/** "mié 18 nov, 2:00 p. m." o "mié 18 nov (todo el día)" */
export function formatWhen(startAt: string, allDay: boolean): string {
  const { date, minutes } = toCostaRica(startAt)
  return allDay ? `${shortDate(date)} (todo el día)` : `${shortDate(date)}, ${formatTime(minutes)}`
}

/** Día (Costa Rica) del recordatorio, para abrirlo en el calendario. */
export function notificationDate(notification: AppNotification): DateKey | null {
  return notification.data.start_at ? toCostaRica(notification.data.start_at).date : null
}

const FIELD_NAMES: Record<ChangedField, string> = {
  titulo: 'el título',
  horario: 'la fecha y hora',
  categoria: 'la categoría',
  ubicacion: 'la ubicación',
  descripcion: 'la descripción',
  nota: 'la nota',
}

/** "a", "a y b", "a, b y c" */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export interface NotificationText {
  /** Frase principal. */
  text: string
  /** Detalle opcional (cuándo es, qué había antes). */
  detail?: string
}

/** "Ana modificó «X»: cambió la fecha y hora." con el detalle de cómo era antes. */
function changeText(n: AppNotification, base: string, when: string | undefined): NotificationText {
  const changes = n.data.changes ?? []
  const before = n.data.before
  const text = changes.length ? `${base}: cambió ${listJoin(changes.map((c) => FIELD_NAMES[c]))}.` : `${base}.`
  const details: string[] = []
  if (before && changes.includes('horario') && when) {
    details.push(`Ahora: ${when} (antes: ${formatWhen(before.start_at, before.all_day)})`)
  } else if (when) {
    details.push(when)
  }
  if (before && changes.includes('titulo')) details.push(`Antes se llamaba «${before.title}»`)
  return { text, detail: details.join(' · ') || undefined }
}

export function notificationText(n: AppNotification): NotificationText {
  const title = `«${n.reminder_title}»`
  const who = n.actor?.full_name ?? 'Alguien'
  const when = n.data.start_at ? formatWhen(n.data.start_at, Boolean(n.data.all_day)) : undefined

  switch (n.kind) {
    case 'etiquetado':
      return { text: `${who} le etiquetó en ${title}.`, detail: when }
    case 'quitado':
      return { text: `${who} le quitó de ${title}.`, detail: when }
    case 'salida':
      return { text: `${who} salió de ${title}.`, detail: when }
    case 'modificado':
      return changeText(n, `${who} modificó ${title}`, when)
    case 'general':
      switch (n.data.accion) {
        case 'modificado':
          return changeText(n, `${who} modificó ${title} en el calendario general`, when)
        case 'retirado':
          return { text: `${who} quitó ${title} del calendario general.`, detail: when }
        case 'eliminado':
          return { text: `${who} eliminó ${title} del calendario general.`, detail: when }
        default:
          return { text: `${who} publicó ${title} en el calendario general.`, detail: when }
      }
    case 'outlook': {
      const organizer = n.data.organizer ? ` (organiza ${n.data.organizer})` : ''
      if (n.data.accion === 'modificada') return changeText(n, `Cambió la reunión de Outlook ${title}`, when)
      return { text: `Nueva reunión de Outlook: ${title}${organizer}.`, detail: when }
    }
    case 'aviso': {
      const moment = alertMoment(n.data.minutes_before ?? 0, Boolean(n.data.all_day))
      return { text: `${moment}: ${title}`, detail: when }
    }
  }
}

/** "ahora", "hace 5 min", "hace 2 h", "ayer", "mié 18 nov" */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const today = toCostaRica(now).date
  const day = toCostaRica(iso).date
  const yesterday = toCostaRica(new Date(now.getTime() - 86_400_000)).date
  if (day === yesterday && day !== today) return 'ayer'
  return shortDate(day)
}
