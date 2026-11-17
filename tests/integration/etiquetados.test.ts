import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createServiceClient, createSignedInUser, readLocalStatus, uniqueSuffix } from './helpers.ts'

const suffix = `e${uniqueSuffix()}`

let luis: SupabaseClient
let carlos: SupabaseClient
let ana: SupabaseClient
let admin: SupabaseClient
let luisId: string
let carlosId: string
let anaId: string
let categoryId: number

// Misma consulta que src/features/calendar/api.ts (listCalendarReminders).
const COLUMNS =
  'id, title, owner:profiles!reminders_owner_id_fkey(id, full_name, color), ' +
  'participants:reminder_participants(user:profiles!reminder_participants_user_id_fkey(id, full_name, color))'

interface Row {
  id: number
  title: string
  owner: { id: string }
  participants: { user: { id: string; full_name: string } }[]
}

const FROM = new Date('2026-12-01T00:00:00-06:00').toISOString()
const TO = new Date('2027-01-01T00:00:00-06:00').toISOString()

async function calendarOf(client: SupabaseClient, userIds: string[]): Promise<Row[]> {
  const { data, error } = await client
    .rpc('calendar_reminders', { p_user_ids: userIds, p_from: FROM, p_to: TO })
    .select(COLUMNS)
  if (error) throw error
  return data as unknown as Row[]
}

function save(client: SupabaseClient, id: number | null, title: string, participants: string[]) {
  return client.rpc('save_reminder', {
    p_id: id,
    p_title: title,
    p_description: null,
    p_start_at: '2026-12-10T09:00:00-06:00',
    p_end_at: null,
    p_all_day: false,
    p_category_id: categoryId,
    p_location: null,
    p_note: null,
    p_participants: participants,
  })
}

beforeAll(async () => {
  const status = readLocalStatus()
  const service = createServiceClient(status)
  luis = await createSignedInUser(status, service, `it.luis.${suffix}`, 'user')
  carlos = await createSignedInUser(status, service, `it.carlos.${suffix}`, 'user')
  ana = await createSignedInUser(status, service, `it.ana.${suffix}`, 'user')
  admin = await createSignedInUser(status, service, `it.admin.${suffix}`, 'admin')
  luisId = (await luis.auth.getUser()).data.user!.id
  carlosId = (await carlos.auth.getUser()).data.user!.id
  anaId = (await ana.auth.getUser()).data.user!.id
  const { data } = await luis.from('categories').select('id').eq('name', 'Reunión').single()
  categoryId = data!.id
}, 60_000)

describe('etiquetar', () => {
  let reminderId: number

  it('el creador guarda el recordatorio con etiquetados en una sola llamada', async () => {
    const { data, error } = await save(luis, null, 'Comité', [carlosId, anaId])
    expect(error).toBeNull()
    reminderId = data as number

    const [row] = (await calendarOf(luis, [luisId])).filter((r) => r.id === reminderId)
    expect(row.owner.id).toBe(luisId)
    expect(row.participants.map((p) => p.user.id).sort()).toEqual([carlosId, anaId].sort())
  })

  it('aparece en el calendario de cada etiquetado', async () => {
    expect((await calendarOf(carlos, [carlosId])).map((r) => r.id)).toContain(reminderId)
    expect((await calendarOf(ana, [anaId])).map((r) => r.id)).toContain(reminderId)
  })

  it('solo el admin ve el calendario de otros', async () => {
    const { data: privado, error } = await save(luis, null, 'Solo mío', [])
    expect(error).toBeNull()
    // Carlos intenta ver el calendario de Luis: solo recibe lo que comparte con él.
    const deCarlos = (await calendarOf(carlos, [luisId])).map((r) => r.id)
    expect(deCarlos).toContain(reminderId)
    expect(deCarlos).not.toContain(privado)
    // El admin ve todo el calendario de Luis.
    const delAdmin = (await calendarOf(admin, [luisId])).map((r) => r.id)
    expect(delAdmin).toEqual(expect.arrayContaining([reminderId, privado]))
  })

  it('con varios calendarios elegidos no se repite', async () => {
    const ids = (await calendarOf(admin, [luisId, carlosId, anaId])).map((r) => r.id)
    expect(ids.filter((id) => id === reminderId)).toHaveLength(1)
  })

  it('un etiquetado no puede modificarlo', async () => {
    const { error } = await save(carlos, reminderId, 'Cambiado', [])
    expect(error?.code).toBe('42501')
  })

  it('un etiquetado se sale y deja de verlo en su calendario', async () => {
    const { data } = await carlos
      .from('reminder_participants')
      .delete()
      .eq('reminder_id', reminderId)
      .eq('user_id', carlosId)
      .select('reminder_id')
    expect(data).toHaveLength(1)
    expect((await calendarOf(carlos, [carlosId])).map((r) => r.id)).not.toContain(reminderId)
    // Los demás siguen igual.
    expect((await calendarOf(ana, [anaId])).map((r) => r.id)).toContain(reminderId)
  })

  it('el creador quita a un etiquetado al editar', async () => {
    const { error } = await save(luis, reminderId, 'Comité', [])
    expect(error).toBeNull()
    expect((await calendarOf(ana, [anaId])).map((r) => r.id)).not.toContain(reminderId)
  })
})
