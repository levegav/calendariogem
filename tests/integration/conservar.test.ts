import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServiceClient, createSignedInUser, readLocalStatus, runLocalSql, uniqueSuffix } from './helpers.ts'

const suffix = `c${uniqueSuffix()}`

let luis: SupabaseClient
let carlos: SupabaseClient
let ana: SupabaseClient
let luisId: string
let carlosId: string
let anaId: string
let categoryId: number
const channels: { client: SupabaseClient; channel: RealtimeChannel }[] = []

interface DecisionRow {
  id: number
  reason: string
  reminder_id: number | null
  title: string
}

function save(client: SupabaseClient, title: string, participants: string[], startAt: string) {
  return client.rpc('save_reminder', {
    p_id: null,
    p_title: title,
    p_description: null,
    p_start_at: startAt,
    p_end_at: null,
    p_all_day: false,
    p_category_id: categoryId,
    p_location: null,
    p_note: null,
    p_participants: participants,
    p_alerts: null,
  })
}

async function pending(client: SupabaseClient): Promise<DecisionRow[]> {
  const { data, error } = await client.from('reminder_decisions').select('id, reason, reminder_id, title').is('resolved_at', null)
  if (error) throw error
  return data as DecisionRow[]
}

async function calendarIds(client: SupabaseClient, userId: string): Promise<{ id: number; title: string; owner_id: string }[]> {
  const { data, error } = await client
    .rpc('calendar_reminders', {
      p_user_ids: [userId],
      p_from: '2026-12-01T00:00:00-06:00',
      p_to: '2027-01-01T00:00:00-06:00',
    })
    .select('id, title, owner_id')
  if (error) throw error
  return data as { id: number; title: string; owner_id: string }[]
}

async function listenDecisions(client: SupabaseClient, userId: string): Promise<DecisionRow[]> {
  const received: DecisionRow[] = []
  const {
    data: { session },
  } = await client.auth.getSession()
  client.realtime.setAuth(session!.access_token)
  await new Promise<void>((resolve, reject) => {
    const channel = client
      .channel(`decisiones-${suffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reminder_decisions', filter: `user_id=eq.${userId}` },
        (payload) => received.push(payload.new as DecisionRow),
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status))
      })
    channels.push({ client, channel })
  })
  // "SUBSCRIBED" llega antes de que el servidor termine de preparar la escucha de cambios.
  await new Promise((r) => setTimeout(r, 3000))
  return received
}

beforeAll(async () => {
  const status = readLocalStatus()
  const service = createServiceClient(status)
  luis = await createSignedInUser(status, service, `it.luis.${suffix}`, 'user')
  carlos = await createSignedInUser(status, service, `it.carlos.${suffix}`, 'user')
  ana = await createSignedInUser(status, service, `it.ana.${suffix}`, 'user')
  luisId = (await luis.auth.getUser()).data.user!.id
  carlosId = (await carlos.auth.getUser()).data.user!.id
  anaId = (await ana.auth.getUser()).data.user!.id
  const { data } = await luis.from('categories').select('id').eq('name', 'Reunión').single()
  categoryId = data!.id
}, 60_000)

afterAll(async () => {
  await Promise.all(channels.map(({ client, channel }) => client.removeChannel(channel)))
})

describe('Conservar / Eliminar', () => {
  it('al eliminar, la decisión llega en tiempo real; conservar crea una copia propia', async () => {
    const recibidas = await listenDecisions(carlos, carlosId)
    const { data: id } = await save(luis, 'Cierre de mes', [carlosId, anaId], '2026-12-30T15:00:00-06:00')
    const { error } = await luis.from('reminders').delete().eq('id', id)
    expect(error).toBeNull()

    const deadline = Date.now() + 15_000
    while (!recibidas.some((d) => d.title === 'Cierre de mes') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200))
    }
    expect(recibidas.find((d) => d.title === 'Cierre de mes')).toMatchObject({ reason: 'eliminado', reminder_id: null })

    const [deCarlos] = (await pending(carlos)).filter((d) => d.title === 'Cierre de mes')
    const { data: copia, error: e2 } = await carlos.rpc('resolve_reminder_decision', { p_id: deCarlos.id, p_keep: true })
    expect(e2).toBeNull()
    const calendario = await calendarIds(carlos, carlosId)
    expect(calendario).toContainEqual({ id: copia, title: 'Cierre de mes', owner_id: carlosId })

    // Ana elimina: no le queda nada en su calendario.
    const [deAna] = (await pending(ana)).filter((d) => d.title === 'Cierre de mes')
    await ana.rpc('resolve_reminder_decision', { p_id: deAna.id, p_keep: false })
    expect((await calendarIds(ana, anaId)).filter((r) => r.title === 'Cierre de mes')).toEqual([])
    expect(await pending(ana)).toEqual([])
  }, 30_000)

  it('al desactivar al creador, sus etiquetados deciden sobre los recordatorios futuros', async () => {
    const { data: futuro } = await save(luis, 'Planificación 2027', [carlosId], '2026-12-20T09:00:00-06:00')
    runLocalSql(`update public.profiles set active = false where id = '${luisId}';`)
    try {
      const decision = (await pending(carlos)).find((d) => d.reminder_id === futuro)
      expect(decision).toMatchObject({ reason: 'creador_desactivado', title: 'Planificación 2027' })

      const { error } = await carlos.rpc('resolve_reminder_decision', { p_id: decision!.id, p_keep: false })
      expect(error).toBeNull()
      expect((await calendarIds(carlos, carlosId)).map((r) => r.id)).not.toContain(futuro)
    } finally {
      runLocalSql(`update public.profiles set active = true where id = '${luisId}';`)
    }
  })
})
