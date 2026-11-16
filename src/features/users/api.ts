import { FunctionsHttpError } from '@supabase/supabase-js'
import type { UserRole } from '../../lib/auth'
import { AppError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { PROFILE_COLUMNS, type Profile } from '../auth/AuthContext'

export async function listUsers(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).order('full_name')
  if (error) throw error
  return data
}

/** Cambia nombre, rol y color (la BD valida que quien llama sea admin y que el color esté libre). */
export async function updateUser(
  user: Pick<Profile, 'id' | 'full_name' | 'role' | 'active' | 'color'>,
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_user', {
    p_user_id: user.id,
    p_full_name: user.full_name,
    p_role: user.role,
    p_active: user.active,
    p_color: user.color,
  })
  if (error) throw error
}

/** Llama a la Edge Function `admin-users` y convierte su respuesta de error en AppError. */
async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-users', { body })
  if (error instanceof FunctionsHttpError) {
    const payload = await (error.context as Response).json().catch(() => null)
    throw new AppError(payload?.error ?? 'No se pudo completar la operación. Intente de nuevo.')
  }
  if (error) throw error
  return data as T
}

export function createUser(input: {
  username: string
  full_name: string
  role: UserRole
  color: string
  password: string
}): Promise<{ id: string; username: string }> {
  return invokeAdminUsers({ action: 'create', ...input })
}

export function setUserActive(userId: string, active: boolean): Promise<void> {
  return invokeAdminUsers({ action: 'set_active', user_id: userId, active })
}

export function resetUserPassword(userId: string, password: string): Promise<void> {
  return invokeAdminUsers({ action: 'reset_password', user_id: userId, password })
}
