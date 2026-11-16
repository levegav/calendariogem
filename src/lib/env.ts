export interface SupabaseEnv {
  url: string
  publishableKey: string
}

type RawEnv = {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

/**
 * Lee y valida la configuración pública de Supabase.
 * Rechaza claves secretas para que nunca terminen en el navegador.
 */
export function readSupabaseEnv(env: RawEnv = import.meta.env): SupabaseEnv {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

  const missing = [
    !url && 'VITE_SUPABASE_URL',
    !publishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean)
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno: ${missing.join(', ')}. Copie .env.example a .env.local y complételo.`,
    )
  }

  if (isSecretKey(publishableKey)) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY contiene una clave secreta. Use la clave pública (publishable/anon).',
    )
  }

  return { url, publishableKey }
}

function isSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true

  // Claves heredadas en formato JWT: revisar el rol declarado.
  const parts = key.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}
