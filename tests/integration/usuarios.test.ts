import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createPublicClient,
  createServiceClient,
  createSignedInUser,
  readLocalStatus,
  uniqueSuffix,
  USERNAME_DOMAIN,
} from './helpers.ts'

const suffix = `u${uniqueSuffix()}`
const TEMP_PASSWORD = 'Temporal123'

let status: ReturnType<typeof readLocalStatus>
let admin: SupabaseClient
let adminId: string
let standard: SupabaseClient

/** Color aleatorio para no chocar con otras ejecuciones (los colores son únicos). */
function randomColor(): string {
  return '#' + Array.from({ length: 3 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')
}

/** Llama a la Edge Function y devuelve { status, body } incluso en errores HTTP. */
async function adminUsers(client: SupabaseClient, body: object) {
  const { data, error } = await client.functions.invoke('admin-users', { body })
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    return { status: response.status, body: await response.json() }
  }
  if (error) throw error
  return { status: 200, body: data }
}

async function signIn(username: string, password: string) {
  const client = createPublicClient(status)
  const { error } = await client.auth.signInWithPassword({ email: `${username}@${USERNAME_DOMAIN}`, password })
  return { client, error }
}

beforeAll(async () => {
  status = readLocalStatus()
  const service = createServiceClient(status)
  admin = await createSignedInUser(status, service, `it.admin.${suffix}`, 'admin')
  adminId = (await admin.auth.getUser()).data.user!.id
  standard = await createSignedInUser(status, service, `it.user.${suffix}`, 'user')
}, 60_000)

describe('Edge Function admin-users', () => {
  const username = `nuevo.${suffix}`
  const color = randomColor()
  let newUserId: string

  it('el admin crea un usuario con nombre, rol y color', async () => {
    const result = await adminUsers(admin, {
      action: 'create',
      username: `  Nuevo.${suffix} `,
      full_name: 'Usuario Nuevo',
      role: 'user',
      color: color.toUpperCase(),
      password: TEMP_PASSWORD,
    })
    expect(result.status).toBe(200)
    expect(result.body.username).toBe(username)
    newUserId = result.body.id

    const { client, error } = await signIn(username, TEMP_PASSWORD)
    expect(error).toBeNull()
    const { data: profile } = await client
      .from('profiles')
      .select('full_name, role, active, must_change_password, color')
      .eq('id', newUserId)
      .single()
    expect(profile).toEqual({
      full_name: 'Usuario Nuevo',
      role: 'user',
      active: true,
      must_change_password: true,
      color,
    })
  })

  it('rechaza usuarios duplicados', async () => {
    const result = await adminUsers(admin, {
      action: 'create',
      username,
      full_name: 'Otro',
      role: 'user',
      color: randomColor(),
      password: TEMP_PASSWORD,
    })
    expect(result.status).toBe(409)
    expect(result.body.error).toBe('Ese nombre de usuario ya existe.')
  })

  it('rechaza un color que ya usa otro usuario, sin crear la cuenta', async () => {
    const result = await adminUsers(admin, {
      action: 'create',
      username: `color.${suffix}`,
      full_name: 'Color Repetido',
      role: 'user',
      color,
      password: TEMP_PASSWORD,
    })
    expect(result.status).toBe(409)
    expect(result.body.error).toBe('Ese color ya lo usa Usuario Nuevo. Elija uno distinto.')
    const { error } = await signIn(`color.${suffix}`, TEMP_PASSWORD)
    expect(error).not.toBeNull()
  })

  it('rechaza colores con formato inválido', async () => {
    const result = await adminUsers(admin, {
      action: 'create',
      username: `malcolor.${suffix}`,
      full_name: 'Mal Color',
      role: 'user',
      color: 'azul',
      password: TEMP_PASSWORD,
    })
    expect(result.status).toBe(400)
  })

  it('un usuario estándar no puede usar la función', async () => {
    const result = await adminUsers(standard, {
      action: 'create',
      username: `intruso.${suffix}`,
      full_name: 'Intruso',
      role: 'admin',
      color: randomColor(),
      password: TEMP_PASSWORD,
    })
    expect(result.status).toBe(403)
  })

  it('el admin restablece la contraseña y el usuario debe cambiarla', async () => {
    const result = await adminUsers(admin, { action: 'reset_password', user_id: newUserId, password: 'NuevaTemp456' })
    expect(result.status).toBe(200)
    const { error: oldError } = await signIn(username, TEMP_PASSWORD)
    expect(oldError).not.toBeNull()
    const { error } = await signIn(username, 'NuevaTemp456')
    expect(error).toBeNull()
  })

  it('desactivar bloquea el inicio de sesión y conserva el perfil; activar lo devuelve', async () => {
    const off = await adminUsers(admin, { action: 'set_active', user_id: newUserId, active: false })
    expect(off.status).toBe(200)
    const { error } = await signIn(username, 'NuevaTemp456')
    expect(error).not.toBeNull()

    const { data: profile } = await admin.from('profiles').select('active, color').eq('id', newUserId).single()
    expect(profile).toEqual({ active: false, color })

    const on = await adminUsers(admin, { action: 'set_active', user_id: newUserId, active: true })
    expect(on.status).toBe(200)
    const { error: againError } = await signIn(username, 'NuevaTemp456')
    expect(againError).toBeNull()
  })

  it('el admin no puede desactivarse a sí mismo', async () => {
    const result = await adminUsers(admin, { action: 'set_active', user_id: adminId, active: false })
    expect(result.status).toBe(400)
  })

  it('una cuenta creada fuera de la app nace sin acceso a los datos', async () => {
    const service = createServiceClient(status)
    const email = `externo.${suffix}@${USERNAME_DOMAIN}`
    const { error: createError } = await service.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
    })
    expect(createError).toBeNull()
    const client = createPublicClient(status)
    await client.auth.signInWithPassword({ email, password: TEMP_PASSWORD })
    const { data } = await client.from('profiles').select('id')
    expect(data).toEqual([])
  })
})
