import { createContext, useContext } from 'react'
import type { Database } from '../../types/database.types'

export type Profile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'full_name' | 'role' | 'active' | 'must_change_password' | 'color' | 'theme' | 'general_access'
>

export const PROFILE_COLUMNS = 'id, username, full_name, role, active, must_change_password, color, theme, general_access'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; profile: Profile }

export interface AuthContextValue {
  state: AuthState
  signIn(username: string, password: string): Promise<void>
  signOut(): Promise<void>
  refreshProfile(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return value
}
