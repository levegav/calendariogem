import { execSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface LocalStatus {
  API_URL: string
  PUBLISHABLE_KEY: string
  SECRET_KEY: string
}

/** Lee URL y claves del Supabase LOCAL (`supabase start`). Nunca apunta a producción. */
export function readLocalStatus(): LocalStatus {
  const output = execSync('npx supabase status -o json', { encoding: 'utf8' })
  const json = output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)
  const status = JSON.parse(json) as LocalStatus
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(status.API_URL)) {
    throw new Error(`Las pruebas de integración solo corren contra Supabase local (${status.API_URL}).`)
  }
  return status
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

export function createServiceClient(status: LocalStatus): SupabaseClient {
  return createClient(status.API_URL, status.SECRET_KEY, clientOptions)
}

export function createPublicClient(status: LocalStatus): SupabaseClient {
  return createClient(status.API_URL, status.PUBLISHABLE_KEY, clientOptions)
}

export const TEST_PASSWORD = 'Prueba12345'
export const USERNAME_DOMAIN = 'calendariogem.local'

/** Sufijo único por ejecución: los archivos de prueba corren en paralelo. */
export function uniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** Ejecuta SQL como superusuario en el contenedor de la BD local (solo para preparar pruebas). */
export function runLocalSql(sql: string): void {
  execSync('docker exec -i supabase_db_calendariogem psql -U postgres -v ON_ERROR_STOP=1 -q', {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  })
}

/** Crea un usuario de prueba, le asigna el rol, lo activa e inicia sesión con él. */
export async function createSignedInUser(
  status: LocalStatus,
  service: SupabaseClient,
  username: string,
  role: 'admin' | 'user',
): Promise<SupabaseClient> {
  const email = `${username}@${USERNAME_DOMAIN}`
  const { data, error: createError } = await service.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createError) throw createError
  runLocalSql(
    `update public.profiles set role = '${role}', active = true, must_change_password = false where id = '${data.user.id}';`,
  )

  const client = createPublicClient(status)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (signInError) throw signInError
  return client
}
