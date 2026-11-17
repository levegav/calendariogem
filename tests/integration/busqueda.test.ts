import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createServiceClient, createSignedInUser, readLocalStatus, uniqueSuffix } from './helpers.ts'

const suffix = `b${uniqueSuffix()}`
let luis: SupabaseClient
let carlos: SupabaseClient
let luisId: string
let carlosId: string
let categoryId: number

// Misma consulta que src/features/calendar/api.ts (searchReminders).
const COLUMNS =
  'id, title, owner:profiles!reminders_owner_id_fkey(id, full_name, color), ' +
  'participants:reminder_participants(user:profiles!reminder_participants_user_id_fkey(id, full_name, color)), ' +
  'alerts:reminder_alerts(minutes_before)'

async function search(client: SupabaseClient, userIds: string[], query: string) {
  const { data, error } = await client
    .rpc('search_reminders', { p_user_ids: userIds, p_query: query, p_limit: 101 })
    .select(COLUMNS)
  if (error) throw error
  return data as unknown as { id: number; title: string; owner: { id: string }; participants: { user: { id: string } }[] }[]
}

function save(client: SupabaseClient, title: string, participants: string[], location: string | null) {
  return client.rpc('save_reminder', {
    p_id: null,
    p_title: title,
    p_description: null,
    p_start_at: '2026-12-12T10:00:00-06:00',
    p_end_at: null,
    p_all_day: false,
    p_category_id: categoryId,
    p_location: location,
    p_note: null,
    p_participants: participants,
    p_alerts: null,
  })
}

beforeAll(async () => {
  const status = readLocalStatus()
  const service = createServiceClient(status)
  luis = await createSignedInUser(status, service, `it.luis.${suffix}`, 'user')
  carlos = await createSignedInUser(status, service, `it.carlos.${suffix}`, 'user')
  luisId = (await luis.auth.getUser()).data.user!.id
  carlosId = (await carlos.auth.getUser()).data.user!.id
  const { data } = await luis.from('categories').select('id').eq('name', 'Reunión').single()
  categoryId = data!.id
}, 60_000)

describe('búsqueda', () => {
  it('encuentra lo propio y donde está etiquetado, sin tildes, con los datos que usa la app', async () => {
    const palabra = `Auditoría${suffix}`
    await save(luis, `${palabra} interna`, [carlosId], 'Sala Jiménez')
    await save(luis, `${palabra} privada`, [], null)

    const deLuis = await search(luis, [luisId], `auditoria${suffix.toLowerCase()}`)
    expect(deLuis.map((r) => r.title).sort()).toEqual([`${palabra} interna`, `${palabra} privada`])

    // Carlos solo encuentra aquella en la que lo etiquetaron, aunque pida el calendario de Luis.
    const deCarlos = await search(carlos, [carlosId, luisId], `${palabra} jimenez`)
    expect(deCarlos).toHaveLength(1)
    expect(deCarlos[0]).toMatchObject({ title: `${palabra} interna`, owner: { id: luisId } })
    expect(deCarlos[0].participants.map((p) => p.user.id)).toEqual([carlosId])
  })
})
