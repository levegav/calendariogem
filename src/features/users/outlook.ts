import { FunctionsHttpError } from '@supabase/supabase-js'
import { AppError } from '../../lib/errors'
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

export interface SyncSummary {
  usuarios: number
  sin_cambios: number
  actualizado: number
  en_espera: number
  error: number
}

/** Lee ya mismo todas las reuniones (o las de un usuario) desde Outlook. */
export async function syncOutlookNow(userId?: string): Promise<SyncSummary> {
  const { data, error } = await supabase.functions.invoke<SyncSummary>('outlook-sync', {
    body: userId ? { user_id: userId } : {},
  })
  if (error instanceof FunctionsHttpError) {
    const payload = await (error.context as Response).json().catch(() => null)
    throw new AppError(payload?.error ?? 'No se pudo sincronizar con Outlook. Intente de nuevo.')
  }
  if (error) throw error
  return data as SyncSummary
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
