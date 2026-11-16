import { readSupabaseEnv } from './env'

export type ServerStatus = 'ok' | 'error'

/**
 * Comprueba que el servidor de Supabase responde (servicio de autenticación).
 * Usa solo la clave pública; no lee ni escribe datos.
 */
export async function checkServer(
  fetchFn: typeof fetch = fetch,
  env = readSupabaseEnv(),
): Promise<ServerStatus> {
  try {
    const response = await fetchFn(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.publishableKey },
    })
    return response.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
