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
  category: { id: number; name: string; color: string; active: boolean }
  owner: { id: string; full_name: string; color: string }
}
