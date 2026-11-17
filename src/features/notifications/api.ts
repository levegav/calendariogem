import { supabase } from '../../lib/supabase'
import type { AppNotification } from './types'

/** Cuántas notificaciones recientes se muestran en la campana. */
export const NOTIFICATIONS_LIMIT = 50

/** Espera tras conectar en tiempo real antes de volver a consultar. */
const SETTLE_MS = 5000

const COLUMNS =
  'id, kind, reminder_id, reminder_title, data, created_at, read_at, ' +
  'actor:profiles!notifications_actor_id_fkey(id, full_name, color)'

export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NOTIFICATIONS_LIMIT)
    .returns<AppNotification[]>()
  if (error) throw error
  return data
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}

/**
 * Escucha en tiempo real las notificaciones y decisiones nuevas del usuario. `onSubscribed`
 * se llama al conectar y al reconectar (para recuperar lo que llegó mientras tanto).
 */
export function subscribeToNotifications(userId: string, onInsert: () => void, onSubscribed: () => void): () => void {
  let settleTimer: number | undefined
  const channel = supabase
    .channel(`notificaciones-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => onInsert(),
    )
    // Decisiones Conservar / Eliminar (Fase 5).
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'reminder_decisions', filter: `user_id=eq.${userId}` },
      () => onInsert(),
    )
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      onSubscribed()
      // "SUBSCRIBED" llega unos segundos antes de que el servidor empiece a enviar
      // cambios: una segunda consulta cubre lo que llegue en ese intervalo.
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(onSubscribed, SETTLE_MS)
    })
  return () => {
    window.clearTimeout(settleTimer)
    void supabase.removeChannel(channel)
  }
}
