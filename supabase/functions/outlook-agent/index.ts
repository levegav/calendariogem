// Edge Function que recibe las reuniones de Outlook desde la oficina.
//
// El script de PowerShell de la VM de Exchange (carpeta `agente/` del repo) lee
// los calendarios por la red interna y llama aquí por HTTPS. No hay conexión de
// Supabase hacia la empresa: el firewall de Exchange queda cerrado.
//
// Autenticación: cabecera x-agent-token = secreto OUTLOOK_AGENT_TOKEN. Ese token
// solo permite pedir la lista de usuarios a sincronizar y guardar sus reuniones.
//
// Acciones (POST JSON):
//   { action: 'targets', version, host } -> { targets: [{ user_id, email, sync_state, needs_full }] }
//   { action: 'save', user_id, status, detail, sync_state, events, full } -> { ok: true }

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES = ['ok', 'sin_permiso', 'no_encontrado', 'error']
const MAX_EVENTS = 3000

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
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

const optionalText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value !== '' ? value.slice(0, max) : null

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  // Solo la llama el script de la oficina, nunca un navegador.
  if (req.headers.get('Origin')) return json(403, { error: 'Origen no permitido.' })
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' })

  try {
    const expected = Deno.env.get('OUTLOOK_AGENT_TOKEN')
    const token = req.headers.get('x-agent-token') ?? ''
    if (!expected || !token || !sameSecret(token, expected)) throw new HttpError(401, 'Token no válido.')

    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('Falta SUPABASE_URL en el entorno de la función.')
    const db = createClient(url, readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Solicitud no válida.')

    if (body.action === 'targets') {
      const { error: checkinError } = await db.rpc('outlook_agent_checkin', {
        p_version: optionalText(body.version, 50),
        p_host: optionalText(body.host, 100),
      })
      if (checkinError) throw checkinError
      const { data, error } = await db.rpc('outlook_sync_targets', { p_user_id: null })
      if (error) throw error
      return json(200, { targets: data ?? [] })
    }

    if (body.action === 'save') {
      if (typeof body.user_id !== 'string' || !UUID_PATTERN.test(body.user_id)) throw new HttpError(400, 'Usuario no válido.')
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Estado no válido.')
      const events = body.events ?? null
      if (events !== null && (!Array.isArray(events) || events.length > MAX_EVENTS)) {
        throw new HttpError(400, 'Reuniones no válidas.')
      }
      const { error } = await db.rpc('outlook_save_result', {
        p_user_id: body.user_id,
        p_status: body.status,
        p_detail: optionalText(body.detail, 500),
        p_sync_state: optionalText(body.sync_state, 20000),
        p_events: events,
        p_full: body.full === true,
        // Fin de la ventana leída (script 1.1+): una reunión que falta y empezaba después no se da por borrada.
        p_window_to: typeof body.window_to === 'string' && !Number.isNaN(Date.parse(body.window_to)) ? body.window_to : null,
      })
      if (error) throw error
      return json(200, { ok: true })
    }

    throw new HttpError(400, 'Acción no válida.')
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message })
    console.error(error)
    return json(500, { error: 'Error interno. Intente de nuevo.' })
  }
})
