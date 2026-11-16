import { AppError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { CalendarEvent } from './types'

const COLUMNS =
  'id, title, description, start_at, end_at, all_day, location, note, ' +
  'category:categories!reminders_category_id_fkey(id, name, color, active), ' +
  'owner:profiles!reminders_owner_id_fkey(id, full_name, color)'

/**
 * Recordatorios propios que se ven en el rango [desde, hasta): los que empiezan
 * antes de "hasta" y terminan (o empiezan, si no tienen fin) desde "desde".
 */
export async function listMyReminders(ownerId: string, fromIso: string, toIso: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select(COLUMNS)
    .eq('owner_id', ownerId)
    .lt('start_at', toIso)
    .or(`end_at.gte.${fromIso},and(end_at.is.null,start_at.gte.${fromIso})`)
    .order('start_at')
    .returns<CalendarEvent[]>()
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
}

export async function createReminder(payload: ReminderPayload): Promise<void> {
  const { error } = await supabase.from('reminders').insert(payload)
  if (error) throw error
}

export async function updateReminder(id: number, payload: ReminderPayload): Promise<void> {
  const { data, error } = await supabase.from('reminders').update(payload).eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new AppError('Solo el creador puede modificar este recordatorio.')
}

export async function deleteReminder(id: number): Promise<void> {
  const { data, error } = await supabase.from('reminders').delete().eq('id', id).select('id')
  if (error) throw error
  if (data.length === 0) throw new AppError('Solo el creador puede eliminar este recordatorio.')
}
