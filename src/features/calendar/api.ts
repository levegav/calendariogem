import { AppError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database.types'
import type { CalendarEvent, Person } from './types'

const COLUMNS =
  'id, title, description, start_at, end_at, all_day, location, note, is_general, ' +
  'category:categories!reminders_category_id_fkey(id, name, color, active, personal_only), ' +
  'owner:profiles!reminders_owner_id_fkey(id, full_name, color), ' +
  'participants:reminder_participants(user:profiles!reminder_participants_user_id_fkey(id, full_name, color)), ' +
  // Por RLS, cada quien recibe solo sus propios avisos.
  'alerts:reminder_alerts(minutes_before)'

type ReminderRow = Omit<CalendarEvent, 'participants' | 'my_alerts'> & {
  participants: { user: Person }[]
  alerts: { minutes_before: number }[]
}

const byName = (a: Person, b: Person) => a.full_name.localeCompare(b.full_name, 'es')

function toEvent({ participants, alerts, ...row }: ReminderRow): CalendarEvent {
  return {
    ...row,
    participants: participants.map((p) => p.user).sort(byName),
    my_alerts: alerts.map((a) => a.minutes_before).sort((a, b) => a - b),
  }
}

/**
 * Recordatorios de los calendarios elegidos (creados por esas personas o en los
 * que están etiquetadas) que se ven en el rango [desde, hasta).
 */
export async function listCalendarReminders(userIds: string[], fromIso: string, toIso: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .rpc('calendar_reminders', { p_user_ids: userIds, p_from: fromIso, p_to: toIso })
    .select(COLUMNS)
    .returns<ReminderRow[]>()
  if (error) throw error
  return data.map(toEvent)
}

/** Usuarios activos: se pueden etiquetar y sus calendarios se pueden ver. */
export async function listPeople(): Promise<Person[]> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, color').eq('active', true).order('full_name')
  if (error) throw error
  return data
}

export interface ReminderPayload {
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  all_day: boolean
  category_id: number
  location: string | null
  note: string | null
  /** Usuarios etiquetados (sin el creador). */
  participant_ids: string[]
  /** Avisos previos del creador (minutos antes). */
  alerts: number[]
  /**
   * Calendario general (true) o personal (false). null = al crear, personal; al
   * modificar, no lo cambia de calendario (p. ej. si el creador ya no tiene acceso).
   */
  is_general: boolean | null
}

type SaveArgs = Database['public']['Functions']['save_reminder']['Args']

/** Crea (id null) o modifica un recordatorio junto con sus etiquetados, en una sola transacción. */
export async function saveReminder(id: number | null, payload: ReminderPayload): Promise<number> {
  const args = {
    p_id: id,
    p_title: payload.title,
    p_description: payload.description,
    p_start_at: payload.start_at,
    p_end_at: payload.end_at,
    p_all_day: payload.all_day,
    p_category_id: payload.category_id,
    p_location: payload.location,
    p_note: payload.note,
    p_participants: payload.participant_ids,
    p_alerts: payload.alerts,
    p_is_general: payload.is_general,
  } as SaveArgs
  const { data, error } = await supabase.rpc('save_reminder', args)
  if (error) throw error
  return data
}

export async function deleteReminder(id: number): Promise<void> {
  const { data, error } = await supabase.from('reminders').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new AppError('Solo el creador puede eliminar este recordatorio.')
}

/** El usuario etiquetado se quita del recordatorio (deja de verlo en su calendario). */
export async function leaveReminder(reminderId: number, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('reminder_participants')
    .delete()
    .eq('reminder_id', reminderId)
    .eq('user_id', userId)
    .select('reminder_id')
  if (error) throw error
  if (data.length === 0) throw new AppError('Ya no está etiquetado en este recordatorio.')
}

/** Cambia los avisos previos del usuario en sesión (creador o etiquetado) en un recordatorio. */
export async function setMyAlerts(reminderId: number, minutes: number[]): Promise<void> {
  const { error } = await supabase.rpc('set_reminder_alerts', { p_reminder_id: reminderId, p_minutes: minutes })
  if (error) throw error
}

/** Máximo de resultados que se muestran al buscar. */
export const SEARCH_LIMIT = 100

/**
 * Busca en todas las fechas de los calendarios elegidos (título, descripción,
 * ubicación y nota; sin importar tildes). Primero lo más cercano a hoy.
 * Pide uno de más para saber si hubo más coincidencias.
 */
export async function searchReminders(userIds: string[], query: string): Promise<{ results: CalendarEvent[]; truncated: boolean }> {
  const { data, error } = await supabase
    .rpc('search_reminders', { p_user_ids: userIds, p_query: query, p_limit: SEARCH_LIMIT + 1 })
    .select(COLUMNS)
    .returns<ReminderRow[]>()
  if (error) throw error
  return { results: data.slice(0, SEARCH_LIMIT).map(toEvent), truncated: data.length > SEARCH_LIMIT }
}
