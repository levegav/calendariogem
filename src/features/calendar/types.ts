export type CalendarView = 'dia' | 'semana' | 'mes' | 'ano'

export const VIEW_LABELS: Record<CalendarView, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes',
  ano: 'Año',
}

export const VIEWS: CalendarView[] = ['dia', 'semana', 'mes', 'ano']

export function isCalendarView(value: unknown): value is CalendarView {
  return value === 'dia' || value === 'semana' || value === 'mes' || value === 'ano'
}

/** Un usuario tal como aparece en el calendario (creador, etiquetado o calendario visible). */
export interface Person {
  id: string
  full_name: string
  color: string
}

/** Un recordatorio tal como lo muestra el calendario. */
export interface CalendarEvent {
  id: number
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  all_day: boolean
  location: string | null
  note: string | null
  category: { id: number; name: string; color: string; active: boolean; personal_only: boolean }
  owner: Person
  /** true = publicado en el calendario general; false = calendario personal del creador. */
  is_general: boolean
  /** Usuarios etiquetados (sin el creador), por nombre. */
  participants: Person[]
  /** Avisos previos del usuario en sesión (minutos antes); vacío si no participa. */
  my_alerts: number[]
  /** Solo en las reuniones traídas de Outlook (de solo lectura; owner = de quién es el calendario). */
  outlook?: OutlookInfo
}

export interface OutlookAttendee {
  name: string
  email: string | null
  /** Accept, Tentative, Decline, NoResponseReceived, Unknown, Organizer… */
  response: string | null
  optional: boolean
}

/** Datos propios de una reunión de Outlook. */
export interface OutlookInfo {
  /** Identificador permanente de la reunión (sirve para sus avisos). */
  event_key: string
  /** Los avisos siguen al recordatorio de Outlook (false = la persona los cambió en la app). */
  alerts_from_outlook: boolean
  organizer_name: string | null
  organizer_email: string | null
  attendees: OutlookAttendee[]
  join_url: string | null
  is_recurring: boolean
  is_cancelled: boolean
  show_as: string | null
  my_response: string | null
}
