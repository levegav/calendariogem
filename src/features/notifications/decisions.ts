import { supabase } from '../../lib/supabase'
import type { Person } from '../calendar/types'

/**
 * Decisión Conservar / Eliminar pendiente de un etiquetado, o de alguien con
 * acceso al calendario general cuando se elimina un recordatorio de ahí.
 */
export interface PendingDecision {
  id: number
  reason: 'eliminado' | 'creador_desactivado' | 'general_eliminado'
  title: string
  start_at: string
  end_at: string | null
  all_day: boolean
  location: string | null
  created_at: string
  former_owner: Person | null
}

const COLUMNS =
  'id, reason, title, start_at, end_at, all_day, location, created_at, ' +
  'former_owner:profiles!reminder_decisions_former_owner_id_fkey(id, full_name, color)'

/** Pendientes, de la más vieja a la más nueva (se presentan una por una). */
export async function listPendingDecisions(): Promise<PendingDecision[]> {
  const { data, error } = await supabase
    .from('reminder_decisions')
    .select(COLUMNS)
    .is('resolved_at', null)
    .order('created_at')
    .order('id')
    .returns<PendingDecision[]>()
  if (error) throw error
  return data
}

/** Conservar (true) crea una copia propia; Eliminar (false) solo quita la participación. */
export async function resolveDecision(id: number, keep: boolean): Promise<void> {
  const { error } = await supabase.rpc('resolve_reminder_decision', { p_id: id, p_keep: keep })
  if (error) throw error
}
