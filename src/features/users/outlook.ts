import { supabase } from '../../lib/supabase'

export type OutlookStatus = 'pendiente' | 'ok' | 'sin_permiso' | 'no_encontrado' | 'error'

/** Correo de Outlook de un usuario y cómo va su sincronización. */
export interface OutlookLink {
  user_id: string
  email: string
  status: OutlookStatus
  status_detail: string | null
  /** Última consulta a Outlook. */
  checked_at: string | null
  /** Última vez que se trajeron reuniones. */
  refreshed_at: string | null
}

/** Formato básico de un correo (la base de datos hace la misma validación). */
export const OUTLOOK_EMAIL_PATTERN = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/

export function normalizeOutlookEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Devuelve el problema del correo, o null si está bien (vacío = sin Outlook). */
export function outlookEmailProblem(value: string): string | null {
  const email = normalizeOutlookEmail(value)
  if (email === '' || OUTLOOK_EMAIL_PATTERN.test(email)) return null
  return 'El correo de Outlook no es válido.'
}

export async function listOutlookLinks(): Promise<OutlookLink[]> {
  const { data, error } = await supabase
    .from('outlook_links')
    .select('user_id, email, status, status_detail, checked_at, refreshed_at')
  if (error) throw error
  return data as OutlookLink[]
}

/** Asigna, cambia o quita (vacío) el correo de Outlook de un usuario. */
export async function setOutlookEmail(userId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_outlook_email', {
    p_user_id: userId,
    p_email: normalizeOutlookEmail(email),
  })
  if (error) throw error
}

/**
 * Pide volver a leer todas las reuniones (o las de un usuario). Lo hace el
 * script de la oficina en su próxima pasada (menos de un minuto).
 */
export async function syncOutlookNow(userId?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_request_outlook_sync', userId ? { p_user_id: userId } : {})
  if (error) throw error
}

/** Script de la oficina que lee Outlook: cuándo se conectó por última vez. */
export interface AgentStatus {
  seen_at: string | null
  version: string | null
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const { data, error } = await supabase.rpc('outlook_agent_status')
  if (error) throw error
  return data[0] ?? { seen_at: null, version: null }
}

/** Si no se conecta en este tiempo, se considera detenido (corre cada minuto). */
export const AGENT_STALE_MS = 5 * 60_000

/** "Conectado (hace 1 min)", "Sin conexión desde…" o "Todavía no se ha conectado". */
export function describeAgent(status: AgentStatus, now: Date = new Date()): { label: string; ok: boolean } {
  if (!status.seen_at) return { label: 'El programa de la oficina todavía no se ha conectado.', ok: false }
  const seen = new Date(status.seen_at)
  const minutes = Math.max(0, Math.round((now.getTime() - seen.getTime()) / 60_000))
  if (now.getTime() - seen.getTime() > AGENT_STALE_MS) {
    return {
      label: `El programa de la oficina no se conecta desde el ${seen.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}. Revise la tarea programada en el servidor de Exchange.`,
      ok: false,
    }
  }
  return { label: `Programa de la oficina conectado (${minutes <= 1 ? 'hace 1 min' : `hace ${minutes} min`}).`, ok: true }
}

/** Texto y estilo del estado, para la lista de usuarios. */
export function describeOutlookStatus(link: OutlookLink): { label: string; tone: 'success' | 'muted' | 'warning' | 'danger' } {
  switch (link.status) {
    case 'ok':
      return { label: 'Outlook sincronizado', tone: 'success' }
    case 'pendiente':
      return { label: 'Outlook: pendiente', tone: 'muted' }
    case 'sin_permiso':
      return { label: 'Outlook: sin permiso en Exchange', tone: 'warning' }
    case 'no_encontrado':
      return { label: 'Outlook: buzón no encontrado', tone: 'warning' }
    case 'error':
      return { label: 'Outlook: error', tone: 'danger' }
  }
}
