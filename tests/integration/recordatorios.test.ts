import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createServiceClient, createSignedInUser, readLocalStatus, uniqueSuffix } from './helpers.ts'

const suffix = `r${uniqueSuffix()}`

let luis: SupabaseClient
let luisId: string
let carlos: SupabaseClient
let categoryId: number

// Misma consulta que src/features/calendar/api.ts (listMyReminders).
const COLUMNS =
  'id, title, start_at, end_at, all_day, ' +
  'category:categories!reminders_category_id_fkey(id, name, color, active), ' +
  'owner:profiles!reminders_owner_id_fkey(id, full_name, color)'

async function inRange(client: SupabaseClient, ownerId: string, fromIso: string, toIso: string) {
  const { data, error } = await client
    .from('reminders')
    .select(COLUMNS)
    .eq('owner_id', ownerId)
    .lt('start_at', toIso)
    .or(`end_at.gte.${fromIso},and(end_at.is.null,start_at.gte.${fromIso})`)
    .order('start_at')
  if (error) throw error
  return (data as unknown as { title: string }[]).map((r) => r.title)
}

beforeAll(async () => {
  const status = readLocalStatus()
  const service = createServiceClient(status)
  luis = await createSignedInUser(status, service, `it.luis.${suffix}`, 'user')
  luisId = (await luis.auth.getUser()).data.user!.id
  carlos = await createSignedInUser(status, service, `it.carlos.${suffix}`, 'user')
  const { data } = await luis.from('categories').select('id').eq('name', 'Tarea').single()
  categoryId = data!.id

  const rows = [
    { title: 'Antes', start_at: '2026-11-15T10:00:00-06:00' },
    { title: 'Dentro', start_at: '2026-11-16T09:00:00-06:00', end_at: '2026-11-16T10:00:00-06:00' },
    { title: 'Cruza el inicio', start_at: '2026-11-15T22:00:00-06:00', end_at: '2026-11-16T02:00:00-06:00' },
    { title: 'Varios días', start_at: '2026-11-10T00:00:00-06:00', end_at: '2026-11-20T00:00:00-06:00', all_day: true },
    { title: 'Después', start_at: '2026-11-17T00:00:00-06:00' },
  ]
  for (const row of rows) {
    const { error } = await luis.from('reminders').insert({ ...row, category_id: categoryId })
    if (error) throw error
  }
}, 60_000)

describe('consulta de recordatorios por rango', () => {
  it('trae solo los que se ven en el día, incluidos los que cruzan el rango', async () => {
    const titles = await inRange(
      luis,
      luisId,
      new Date('2026-11-16T00:00:00-06:00').toISOString(),
      new Date('2026-11-17T00:00:00-06:00').toISOString(),
    )
    expect(titles.sort()).toEqual(['Cruza el inicio', 'Dentro', 'Varios días'])
  })

  it('incluye el nombre y color del creador y de la categoría', async () => {
    const { data } = await luis.from('reminders').select(COLUMNS).eq('title', 'Dentro').eq('owner_id', luisId).single()
    const row = data as unknown as { owner: { id: string; color: string }; category: { name: string } }
    expect(row.owner.id).toBe(luisId)
    expect(row.owner.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(row.category.name).toBe('Tarea')
  })
})

describe('propiedad', () => {
  it('otro usuario ve los recordatorios pero no puede modificarlos ni eliminarlos', async () => {
    const { data: visible } = await carlos.from('reminders').select('id').eq('owner_id', luisId)
    expect(visible!.length).toBe(5)

    const { data: updated } = await carlos.from('reminders').update({ title: 'Hackeado' }).eq('owner_id', luisId).select('id')
    expect(updated).toEqual([])
    const { data: deleted } = await carlos.from('reminders').delete().eq('owner_id', luisId).select('id')
    expect(deleted).toEqual([])
  })

  it('el dueño sí puede eliminar el suyo', async () => {
    const { data } = await luis.from('reminders').delete().eq('title', 'Antes').eq('owner_id', luisId).select('id')
    expect(data!.length).toBe(1)
  })
})
