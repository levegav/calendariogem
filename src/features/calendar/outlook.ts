import { supabase } from '../../lib/supabase'
import type { CalendarEvent, OutlookAttendee, Person } from './types'

/** Nombre y color con que se muestran las reuniones traídas de Outlook. */
export const OUTLOOK_NAME = 'Reunión de Outlook'
export const OUTLOOK_COLOR = '#0f6cbd'

/** Categoría ficticia (no existe en la base): sirve para el punto de color y el filtro. */
export const OUTLOOK_CATEGORY: CalendarEvent['category'] = {
  id: -1,
  name: OUTLOOK_NAME,
  color: OUTLOOK_COLOR,
  active: true,
  personal_only: false,
}

/** Máximo de reuniones que se muestran al buscar. */
export const OUTLOOK_SEARCH_LIMIT = 100

const DAY_MS = 86_400_000

const COLUMNS =
  'id, subject, start_at, end_at, all_day, location, organizer_name, organizer_email, attendees, join_url, ' +
  'is_recurring, is_cancelled, show_as, my_response, owner:profiles!outlook_events_user_id_fkey(id, full_name, color)'

interface OutlookRow {
  id: number
  subject: string
  start_at: string
  end_at: string
  all_day: boolean
  location: string | null
  organizer_name: string | null
  organizer_email: string | null
  attendees: OutlookAttendee[] | null
  join_url: string | null
  is_recurring: boolean
  is_cancelled: boolean
  show_as: string | null
  my_response: string | null
  owner: Person
}

/**
 * Una reunión de Outlook con la forma de un recordatorio, para que las vistas
 * la dibujen igual. Su id es negativo para no chocar con los recordatorios.
 * En las de todo el día, Outlook guarda el fin como la medianoche siguiente; la
 * app usa el último día, así que se resta un día.
 */
export function outlookToEvent(row: OutlookRow): CalendarEvent {
  const end = row.all_day ? new Date(Math.max(Date.parse(row.end_at) - DAY_MS, Date.parse(row.start_at))).toISOString() : row.end_at
  return {
    id: -row.id,
    title: row.subject || '(Sin asunto)',
    description: null,
    start_at: row.start_at,
    end_at: end === row.start_at && !row.all_day ? null : end,
    all_day: row.all_day,
    location: row.location,
    note: null,
    category: OUTLOOK_CATEGORY,
    owner: row.owner,
    is_general: false,
    participants: [],
    my_alerts: [],
    outlook: {
      organizer_name: row.organizer_name,
      organizer_email: row.organizer_email,
      attendees: row.attendees ?? [],
      join_url: row.join_url,
      is_recurring: row.is_recurring,
      is_cancelled: row.is_cancelled,
      show_as: row.show_as,
      my_response: row.my_response,
    },
  }
}

/** Reuniones de Outlook de los calendarios elegidos en el rango [desde, hasta). */
export async function listOutlookEvents(userIds: string[], fromIso: string, toIso: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .rpc('calendar_outlook_events', { p_user_ids: userIds, p_from: fromIso, p_to: toIso })
    .select(COLUMNS)
    .returns<OutlookRow[]>()
  if (error) throw error
  return data.map(outlookToEvent)
}

/** Busca en asunto, ubicación y organizador (todas las fechas sincronizadas). */
export async function searchOutlookEvents(userIds: string[], query: string, limit: number): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .rpc('search_outlook_events', { p_user_ids: userIds, p_query: query, p_limit: limit })
    .select(COLUMNS)
    .returns<OutlookRow[]>()
  if (error) throw error
  return data.map(outlookToEvent)
}

/**
 * Avisa cuando llegaron reuniones nuevas de Outlook de alguien (o cambió su
 * estado), para recargar el calendario sin que la persona refresque la página.
 * RLS decide qué cambios recibe cada quien. Al (re)conectarse también avisa con
 * null, por si algo cambió mientras no había conexión.
 */
export function subscribeToOutlookChanges(onChange: (userId: string | null) => void): () => void {
  let connected = false
  const channel = supabase
    .channel('reuniones-outlook')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'outlook_links' }, (payload) => {
      const row = (payload.new && 'user_id' in payload.new ? payload.new : payload.old) as { user_id?: string }
      onChange(row?.user_id ?? null)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (connected) onChange(null) // reconexión
        connected = true
      }
    })
  return () => {
    void supabase.removeChannel(channel)
  }
}

/** Respuesta de un asistente, en español. */
export const RESPONSE_LABELS: Record<string, string> = {
  Organizer: 'Organizador',
  Accept: 'Aceptó',
  Tentative: 'Provisional',
  Decline: 'Rechazó',
  NoResponseReceived: 'Sin respuesta',
  Unknown: 'Sin respuesta',
}

/** Cómo aparece el tiempo en Outlook ("Mostrar como"). */
export const SHOW_AS_LABELS: Record<string, string> = {
  Free: 'Disponible',
  Tentative: 'Provisional',
  Busy: 'Ocupado',
  OOF: 'Fuera de la oficina',
  WorkingElsewhere: 'Trabajando en otro lugar',
}
