// Edge Function de sincronización de reuniones de Outlook (un solo sentido).
//
// La llama pg_cron cada minuto (cabecera x-sync-token) o el admin con
// "Sincronizar ahora" (su sesión). Para cada usuario con correo de Outlook:
//   1. Pregunta a Exchange qué cambió desde la última vez (SyncFolderItems).
//   2. Si cambió algo, o toca la actualización completa del día, lee sus
//      reuniones de un mes atrás a tres meses adelante y las reemplaza.
// Usa una cuenta de servicio con permiso de Revisor (solo lectura) por EWS.
// Sus datos viven solo en los secretos de la función: EWS_USER y EWS_PASSWORD.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { XMLParser } from 'npm:fast-xml-parser@5.11.2'
import {
  calendarViewRequest,
  classifyError,
  describeStatus,
  EwsError,
  getItemRequest,
  parseFindItemIds,
  parseGetItem,
  parseSyncFolderItems,
  syncFolderItemsRequest,
  XML_PARSER_OPTIONS,
  type OutlookEventRow,
} from './ews.ts'

const DEFAULT_EWS_URL = 'https://neptune.gemconsulting.inc/EWS/Exchange.asmx'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_ORIGINS = ['https://calendariogem.pages.dev', 'http://localhost:5173', 'http://127.0.0.1:5173']

const DAY_MS = 86_400_000
const PAST_DAYS = 31
const FUTURE_DAYS = 92
/** Lecturas completas por ejecución (el resto espera al minuto siguiente). */
const MAX_REFRESHES_PER_RUN = 4
/** Usuarios consultados a la vez. */
const CONCURRENCY = 4
/** Lotes de cambios por usuario y ejecución. */
const MAX_SYNC_ROUNDS = 20
const GET_ITEM_BATCH = 50
const EWS_TIMEOUT_MS = 20_000

const parser = new XMLParser(XML_PARSER_OPTIONS)
const parse = (xml: string) => parser.parse(xml)

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** La cuenta de servicio no pudo iniciar sesión: afecta a todos los usuarios. */
class EwsAuthError extends Error {}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function readKey(newName: string, legacyName: string): string {
  const raw = Deno.env.get(newName)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.default === 'string') return parsed.default
    } catch {
      // formato inesperado: se intenta con la clave heredada
    }
  }
  const legacy = Deno.env.get(legacyName)
  if (legacy) return legacy
  throw new Error(`Falta ${newName} en el entorno de la función.`)
}

/** Comparación en tiempo constante (el token no se adivina midiendo tiempos). */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

function basicAuth(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

interface Target {
  user_id: string
  email: string
  sync_state: string | null
  needs_full: boolean
}

interface Ews {
  call(body: string): Promise<string>
}

function ewsClient(): Ews {
  const url = Deno.env.get('EWS_URL') || DEFAULT_EWS_URL
  const user = Deno.env.get('EWS_USER')
  const password = Deno.env.get('EWS_PASSWORD')
  if (!user || !password) {
    throw new HttpError(503, 'Falta configurar la cuenta de servicio de Outlook (EWS_USER y EWS_PASSWORD).')
  }
  const authorization = basicAuth(user, password)
  return {
    async call(body) {
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=utf-8', Authorization: authorization },
          body,
          signal: AbortSignal.timeout(EWS_TIMEOUT_MS),
        })
      } catch (error) {
        throw new EwsError('SinConexion', `No se pudo conectar con Exchange: ${(error as Error).message}`)
      }
      if (response.status === 401) throw new EwsAuthError('Exchange rechazó el usuario o la contraseña de la cuenta de servicio.')
      const text = await response.text()
      if (!response.ok && !text.includes('Envelope')) {
        throw new EwsError(`HTTP${response.status}`, `Exchange respondió con el código ${response.status}.`)
      }
      return text
    },
  }
}

/** Reuniones de la ventana (un mes atrás, tres adelante) con todos sus detalles. */
async function readWindow(ews: Ews, email: string): Promise<OutlookEventRow[]> {
  const now = Date.now()
  const start = new Date(now - PAST_DAYS * DAY_MS).toISOString()
  const end = new Date(now + FUTURE_DAYS * DAY_MS).toISOString()
  const ids = parseFindItemIds(await ews.call(calendarViewRequest(email, start, end)), parse)
  const rows: OutlookEventRow[] = []
  for (let i = 0; i < ids.length; i += GET_ITEM_BATCH) {
    rows.push(...parseGetItem(await ews.call(getItemRequest(ids.slice(i, i + GET_ITEM_BATCH))), parse))
  }
  return rows
}

type Outcome = 'sin_cambios' | 'actualizado' | 'en_espera' | 'error'

interface RunState {
  refreshesLeft: number
}

async function syncUser(ews: Ews, db: SupabaseClient, target: Target, force: boolean, run: RunState): Promise<Outcome> {
  let state = target.sync_state
  let full = force || target.needs_full || !state
  let changed = false

  try {
    // 1. ¿Qué cambió? (si el estado guardado ya no sirve, se empieza de cero)
    for (let round = 0; round < MAX_SYNC_ROUNDS; round++) {
      let result
      try {
        result = parseSyncFolderItems(await ews.call(syncFolderItemsRequest(target.email, state)), parse)
      } catch (error) {
        if (error instanceof EwsError && error.code === 'ErrorInvalidSyncStateData' && state) {
          state = null
          full = true
          continue
        }
        throw error
      }
      if (state && result.changes > 0) changed = true
      state = result.syncState
      if (result.includesLast) break
    }

    // 2. Sin cambios: solo se guarda el estado nuevo.
    if (!full && !changed) {
      await save(db, target.user_id, 'ok', null, state, null, false)
      return 'sin_cambios'
    }

    // Demasiadas lecturas en esta ejecución: no se guarda el estado, así el
    // cambio se vuelve a detectar en el minuto siguiente.
    if (run.refreshesLeft <= 0) return 'en_espera'
    run.refreshesLeft--

    const events = await readWindow(ews, target.email)
    await save(db, target.user_id, 'ok', null, state, events, full)
    return 'actualizado'
  } catch (error) {
    if (error instanceof EwsAuthError) throw error
    const code = error instanceof EwsError ? error.code : 'Error'
    const message = (error as Error).message
    const status = classifyError(code)
    console.error(`outlook-sync ${target.email}: ${code} ${message}`)
    await save(db, target.user_id, status, describeStatus(status, code, message), null, null, false)
    return 'error'
  }
}

async function save(
  db: SupabaseClient,
  userId: string,
  status: string,
  detail: string | null,
  syncState: string | null,
  events: OutlookEventRow[] | null,
  full: boolean,
) {
  const { error } = await db.rpc('outlook_save_result', {
    p_user_id: userId,
    p_status: status,
    p_detail: detail,
    p_sync_state: syncState,
    p_events: events,
    p_full: full,
  })
  if (error) throw new Error(`No se pudo guardar el resultado: ${error.message}`)
}

async function runSync(db: SupabaseClient, userId: string | null, force: boolean) {
  const ews = ewsClient()
  const { data, error } = await db.rpc('outlook_sync_targets', { p_user_id: userId })
  if (error) throw error
  const targets = (data ?? []) as Target[]
  const run: RunState = { refreshesLeft: force ? targets.length : MAX_REFRESHES_PER_RUN }
  const summary: Record<Outcome, number> = { sin_cambios: 0, actualizado: 0, en_espera: 0, error: 0 }

  const queue = [...targets]
  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let target = queue.shift(); target; target = queue.shift()) {
          summary[await syncUser(ews, db, target, force, run)]++
        }
      }),
    )
  } catch (error) {
    if (!(error instanceof EwsAuthError)) throw error
    // Usuario o contraseña incorrectos: se avisa en todos, sin borrar sus reuniones.
    for (const target of targets) {
      await save(db, target.user_id, 'error', error.message, null, null, false)
    }
    throw new HttpError(502, error.message)
  }
  return { usuarios: targets.length, ...summary }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const cors = corsHeaders(origin)
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'Origen no permitido.' })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' })

  let db: SupabaseClient | null = null
  let claimed = false
  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('Falta SUPABASE_URL en el entorno de la función.')
    const options = { auth: { persistSession: false, autoRefreshToken: false } }

    // ¿Quién llama? pg_cron (token) o el admin (sesión).
    let userId: string | null = null
    let manual = false
    const cronToken = req.headers.get('x-sync-token')
    const expected = Deno.env.get('OUTLOOK_SYNC_TOKEN')
    if (cronToken !== null) {
      if (!expected || !sameSecret(cronToken, expected)) throw new HttpError(401, 'Token no válido.')
    } else {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (!token) throw new HttpError(401, 'Sesión no válida. Inicie sesión de nuevo.')
      const caller = createClient(url, readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
        ...options,
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data: userData, error: userError } = await caller.auth.getUser(token)
      if (userError || !userData.user) throw new HttpError(401, 'Sesión no válida. Inicie sesión de nuevo.')
      const { data: profile } = await caller.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle()
      if (!profile?.active || profile.role !== 'admin') {
        throw new HttpError(403, 'Solo el administrador puede sincronizar Outlook.')
      }
      const body = await req.json().catch(() => ({}))
      if (body?.user_id !== undefined && body.user_id !== null) {
        if (typeof body.user_id !== 'string' || !UUID_PATTERN.test(body.user_id)) throw new HttpError(400, 'Usuario no válido.')
        userId = body.user_id
      }
      manual = true
    }

    db = createClient(url, readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), options)
    const { data: turn, error: claimError } = await db.rpc('outlook_claim_run', { p_seconds: 55 })
    if (claimError) throw claimError
    if (!turn) {
      if (manual) throw new HttpError(409, 'Ya hay una sincronización en curso. Intente de nuevo en unos segundos.')
      return json(200, { omitido: 'otra ejecución en curso' })
    }
    claimed = true

    return json(200, await runSync(db, userId, manual))
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message })
    console.error(error)
    return json(500, { error: 'Error interno. Intente de nuevo.' })
  } finally {
    if (claimed && db) await db.rpc('outlook_release_run')
  }
})
