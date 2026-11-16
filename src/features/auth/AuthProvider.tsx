import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usernameToEmail } from '../../lib/auth'
import { toSpanishMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { AuthContext, PROFILE_COLUMNS, type AuthContextValue, type AuthState } from './AuthContext'

const INACTIVE_NOTICE = 'Su usuario está desactivado. Consulte al administrador.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const latestRequest = useRef(0)

  const loadSession = useCallback(async (session: Session | null) => {
    const request = ++latestRequest.current

    if (!session) {
      // Conserva el aviso (p. ej. usuario desactivado) si ya estaba fuera de sesión.
      setState((prev) => (prev.status === 'signedOut' ? prev : { status: 'signedOut' }))
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', session.user.id)
      .maybeSingle()
    if (request !== latestRequest.current) return

    if (error) {
      setState({ status: 'signedOut', notice: toSpanishMessage(error) })
      return
    }

    // RLS oculta los perfiles a usuarios desactivados: sin perfil = sin acceso.
    if (!data || !data.active) {
      setState({ status: 'signedOut', notice: INACTIVE_NOTICE })
      await supabase.auth.signOut()
      return
    }

    setState({ status: 'signedIn', profile: data })
  }, [])

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return
      // Diferido: supabase-js recomienda no llamar a Supabase dentro de este callback.
      setTimeout(() => void loadSession(session), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [loadSession])

  const signIn = useCallback(async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadSession(data.session)
  }, [loadSession])

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signOut, refreshProfile }),
    [state, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
