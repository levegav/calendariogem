// Edge Function de administración de usuarios (solo admin).
// Es la única pieza que usa la clave secreta, que nunca sale del servidor.
// Acciones: create, set_active, reset_password.
//
// Doble verificación: aquí se exige un admin activo, y además los cambios de
// perfil se hacen con la sesión del llamador mediante funciones SQL que vuelven
// a validar el rol en la base de datos.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

const USERNAME_DOMAIN = 'calendariogem.local'
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLOR_PATTERN = /^#[0-9a-f]{6}$/
const ROLES = ['admin', 'user']
const BAN_FOREVER = '876000h' // ~100 años

// Navegadores autorizados: la app publicada y el servidor de desarrollo.
// Las llamadas sin cabecera Origin (no vienen de un navegador) siguen exigiendo sesión de admin.
const ALLOWED_ORIGINS = ['https://calendariogem.pages.dev', 'http://localhost:5173', 'http://127.0.0.1:5173']

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function jsonResponse(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Lee una clave nueva (JSON con `default`) o, si no existe, la heredada. */
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

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

function validatePassword(value: unknown): string {
  const password = typeof value === 'string' ? value : ''
  if (password.length < 8 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, 'La contraseña debe tener entre 8 y 72 caracteres e incluir letras y números.')
  }
  return password
}

function validateUserId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, 'Usuario no válido.')
  }
  return value
}

interface Context {
  callerId: string
  caller: SupabaseClient // sesión del admin: la BD vuelve a validar permisos
  service: SupabaseClient // clave secreta: solo para la API de administración de Auth
}

async function createUser(ctx: Context, body: Record<string, unknown>) {
  const username = String(body.username ?? '').trim().toLowerCase()
  if (!USERNAME_PATTERN.test(username)) {
    throw new HttpError(
      400,
      'El usuario debe tener de 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.',
    )
  }
  const fullName = String(body.full_name ?? '').trim()
  if (fullName.length < 1 || fullName.length > 100) {
    throw new HttpError(400, 'El nombre completo debe tener entre 1 y 100 caracteres.')
  }
  const role = String(body.role ?? '')
  if (!ROLES.includes(role)) {
    throw new HttpError(400, 'Rol no válido.')
  }
  const color = String(body.color ?? '').trim().toLowerCase()
  if (!COLOR_PATTERN.test(color)) {
    throw new HttpError(400, 'El color no es válido. Use el formato #RRGGBB.')
  }
  const password = validatePassword(body.password)

  // Validar el color antes de crear la cuenta evita dejar usuarios a medias.
  const { data: colorOwner, error: colorError } = await ctx.caller
    .from('profiles')
    .select('full_name')
    .eq('color', color)
    .maybeSingle()
  if (colorError) throw colorError
  if (colorOwner) {
    throw new HttpError(409, `Ese color ya lo usa ${colorOwner.full_name}. Elija uno distinto.`)
  }

  const { data, error } = await ctx.service.auth.admin.createUser({
    email: `${username}@${USERNAME_DOMAIN}`,
    password,
    email_confirm: true,
  })
  if (error) {
    if (error.code === 'email_exists' || /already/i.test(error.message)) {
      throw new HttpError(409, 'Ese nombre de usuario ya existe.')
    }
    if (error.code === 'weak_password') {
      throw new HttpError(400, 'La contraseña es demasiado débil.')
    }
    throw error
  }

  // El trigger creó el perfil desactivado; el admin le asigna nombre, rol y color, y lo activa.
  const { error: updateError } = await ctx.caller.rpc('admin_update_user', {
    p_user_id: data.user.id,
    p_full_name: fullName,
    p_role: role,
    p_active: true,
    p_color: color,
  })
  if (updateError) {
    console.error('admin_update_user tras crear usuario', updateError)
    throw new HttpError(500, 'El usuario se creó, pero no se pudieron guardar sus datos. Edítelo desde la lista.')
  }

  return { id: data.user.id, username }
}

async function setActive(ctx: Context, body: Record<string, unknown>) {
  const userId = validateUserId(body.user_id)
  if (typeof body.active !== 'boolean') {
    throw new HttpError(400, 'Debe indicar el estado.')
  }
  if (userId === ctx.callerId) {
    throw new HttpError(400, 'No puede desactivar su propia cuenta.')
  }

  const { data: profile, error: profileError } = await ctx.caller
    .from('profiles')
    .select('full_name, role, color')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile) throw new HttpError(404, 'El usuario no existe.')

  // Primero la BD (bloquea el acceso a los datos de inmediato), luego Auth.
  const { error: updateError } = await ctx.caller.rpc('admin_update_user', {
    p_user_id: userId,
    p_full_name: profile.full_name,
    p_role: profile.role,
    p_active: body.active,
    p_color: profile.color,
  })
  if (updateError) throw new HttpError(400, updateError.message)

  const { error: banError } = await ctx.service.auth.admin.updateUserById(userId, {
    ban_duration: body.active ? 'none' : BAN_FOREVER,
  })
  if (banError) {
    console.error('ban_duration', banError)
    throw new HttpError(500, 'Se actualizó el estado, pero no se pudo actualizar el acceso. Intente de nuevo.')
  }

  return { id: userId, active: body.active }
}

async function resetPassword(ctx: Context, body: Record<string, unknown>) {
  const userId = validateUserId(body.user_id)
  if (userId === ctx.callerId) {
    throw new HttpError(400, 'Para cambiar su propia contraseña use la opción "Cambiar contraseña".')
  }
  const password = validatePassword(body.password)

  const { error } = await ctx.service.auth.admin.updateUserById(userId, { password })
  if (error) {
    if (error.status === 404) throw new HttpError(404, 'El usuario no existe.')
    throw error
  }

  const { error: flagError } = await ctx.caller.rpc('admin_flag_password_reset', { p_user_id: userId })
  if (flagError) throw new HttpError(400, flagError.message)

  return { id: userId }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const cors = corsHeaders(origin)
  const json = (status: number, body: unknown) => jsonResponse(status, body, cors)

  // Un navegador desde otro sitio no puede usar la función.
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json(403, { error: 'Origen no permitido.' })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('Falta SUPABASE_URL en el entorno de la función.')

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) throw new HttpError(401, 'Sesión no válida. Inicie sesión de nuevo.')

    const caller = createClient(url, readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
      ...clientOptions,
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: userData, error: userError } = await caller.auth.getUser(token)
    if (userError || !userData.user) throw new HttpError(401, 'Sesión no válida. Inicie sesión de nuevo.')

    const { data: callerProfile } = await caller
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!callerProfile?.active || callerProfile.role !== 'admin') {
      throw new HttpError(403, 'Solo el administrador puede administrar usuarios.')
    }

    const ctx: Context = {
      callerId: userData.user.id,
      caller,
      service: createClient(url, readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), clientOptions),
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Solicitud no válida.')

    switch (body.action) {
      case 'create':
        return json(200, await createUser(ctx, body))
      case 'set_active':
        return json(200, await setActive(ctx, body))
      case 'reset_password':
        return json(200, await resetPassword(ctx, body))
      default:
        throw new HttpError(400, 'Acción no válida.')
    }
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message })
    console.error(error)
    return json(500, { error: 'Error interno. Intente de nuevo.' })
  }
})
