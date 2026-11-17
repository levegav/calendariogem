import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServiceClient, createSignedInUser, readLocalStatus, uniqueSuffix } from './helpers.ts'

const suffix = `n${uniqueSuffix()}`

let luis: SupabaseClient
let carlos: SupabaseClient
let ana: SupabaseClient
let luisId: string
let carlosId: string
let anaId: string
let categoryId: number
const channels: { client: SupabaseClient; channel: RealtimeChannel }[] = []

interface NotificationRow {
  id: number
  user_id: string
  kind: string
  reminder_id: number | null
  reminder_title: string
  data: { changes?: string[]; minutes_before?: number }
}

function save(
  client: SupabaseClient,
  id: number | null,
  title: string,
  participants: string[],
  startAt = '2026-12-15T09:00:00-06:00',
  alerts: number[] | null = null,
) {
  return client.rpc('save_reminder', {
    p_id: id,
    p_title: title,
    p_description: null,
    p_start_at: startAt,
    p_end_at: null,
    p_all_day: false,
    p_category_id: categoryId,
    p_location: null,
    p_note: null,
    p_participants: participants,
    p_alerts: alerts,
  })
}

async function notificationsOf(client: SupabaseClient, reminderId: number): Promise<NotificationRow[]> {
  const { data, error } = await client.from('notifications').select('*').eq('reminder_id', reminderId).order('id')
  if (error) throw error
  return data as NotificationRow[]
}

/** Se suscribe en tiempo real a las inserciones de notificaciones que el usuario puede ver. */
async function listen(client: SupabaseClient, name: string, filter?: string): Promise<NotificationRow[]> {
  const received: NotificationRow[] = []
  const {
    data: { session },
  } = await client.auth.getSession()
  client.realtime.setAuth(session!.access_token)
  await new Promise<void>((resolve, reject) => {
    const channel = client
      .channel(`${name}-${suffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', ...(filter ? { filter } : {}) },
        (payload) => received.push(payload.new as NotificationRow),
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

async function waitFor<T>(check: () => T | undefined, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = check()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error('Tiempo de espera agotado')
    await new Promise((r) => setTimeout(r, 200))
  }
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

describe('notificaciones', () => {
  it('al etiquetar, la notificación llega en tiempo real solo a quien corresponde', async () => {
    const paraCarlos = await listen(carlos, 'carlos', `user_id=eq.${carlosId}`)
    // Ana escucha todo sin filtro: RLS no debe dejarle ver las de Carlos.
    const paraAna = await listen(ana, 'ana')

    const { data: id, error } = await save(luis, null, 'Revisión trimestral', [carlosId])
    expect(error).toBeNull()

    const llegada = await waitFor(() => paraCarlos.find((n) => n.reminder_id === id), 15_000)
    expect(llegada).toMatchObject({ kind: 'etiquetado', user_id: carlosId, reminder_title: 'Revisión trimestral' })
    await new Promise((r) => setTimeout(r, 1500))
    expect(paraAna.filter((n) => n.reminder_id === id)).toEqual([])
  }, 30_000)

  it('una modificación indica qué cambió; quien es quitado recibe solo "quitado"', async () => {
    const { data: id } = await save(luis, null, 'Comité', [carlosId, anaId])
    const reminderId = id as number

    // Luis cambia el título y quita a Ana en el mismo guardado.
    const { error } = await save(luis, reminderId, 'Comité de compras', [carlosId])
    expect(error).toBeNull()

    const deCarlos = await notificationsOf(carlos, reminderId)
    expect(deCarlos.map((n) => n.kind)).toEqual(['etiquetado', 'modificado'])
    expect(deCarlos[1].data.changes).toEqual(['titulo'])

    const deAna = await notificationsOf(ana, reminderId)
    expect(deAna.map((n) => n.kind)).toEqual(['etiquetado', 'quitado'])

    // Carlos se sale: Luis recibe "salida".
    await carlos.from('reminder_participants').delete().eq('reminder_id', reminderId).eq('user_id', carlosId)
    const deLuis = await notificationsOf(luis, reminderId)
    expect(deLuis.map((n) => n.kind)).toEqual(['salida'])
  })

  it('cada quien marca sus notificaciones como leídas, no las de otros', async () => {
    const { data: id } = await save(luis, null, 'Lectura', [carlosId])
    const [mine] = await notificationsOf(carlos, id as number)
    const { data: hecho } = await carlos.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', mine.id).select('id')
    expect(hecho).toHaveLength(1)
    const { data: ajeno } = await ana.from('notifications').update({ read_at: null }).eq('id', mine.id).select('id')
    expect(ajeno).toEqual([])
  })
})

describe('avisos previos', () => {
  it('cada participante ve y cambia solo sus avisos (la consulta del calendario trae los propios)', async () => {
    const { data: id } = await save(luis, null, 'Con avisos', [carlosId], '2026-12-16T10:00:00-06:00', [30, 1440])
    const reminderId = id as number
    const consulta = (client: SupabaseClient) =>
      client.from('reminders').select('id, alerts:reminder_alerts(minutes_before)').eq('id', reminderId).single()

    const { data: deLuis } = await consulta(luis)
    expect(deLuis!.alerts.map((a: { minutes_before: number }) => a.minutes_before).sort((a: number, b: number) => a - b)).toEqual([30, 1440])
    const { data: deCarlos } = await consulta(carlos)
    expect(deCarlos!.alerts).toEqual([{ minutes_before: 15 }])

    const { error } = await carlos.rpc('set_reminder_alerts', { p_reminder_id: reminderId, p_minutes: [0, 60] })
    expect(error).toBeNull()
    const { data: despues } = await consulta(carlos)
    expect(despues!.alerts.map((a: { minutes_before: number }) => a.minutes_before).sort((a: number, b: number) => a - b)).toEqual([0, 60])

    // Ana no participa: no puede poner avisos.
    const { error: ajeno } = await ana.rpc('set_reminder_alerts', { p_reminder_id: reminderId, p_minutes: [5] })
    expect(ajeno?.code).toBe('42501')
  })

  it('la tarea programada dispara el aviso y llega en tiempo real', async () => {
    const recibidos = await listen(luis, 'luis-avisos', `user_id=eq.${luisId}`)
    // Empieza en 15 min + 3 s: el aviso por defecto (15 min antes) toca en 3 s.
    const inicio = new Date(Date.now() + 15 * 60_000 + 3_000).toISOString()
    const { data: id, error } = await save(luis, null, 'Llamada con proveedor', [], inicio)
    expect(error).toBeNull()

    // pg_cron revisa cada 30 s.
    const aviso = await waitFor(() => recibidos.find((n) => n.reminder_id === id && n.kind === 'aviso'), 50_000)
    expect(aviso.data.minutes_before).toBe(15)
    expect(aviso.reminder_title).toBe('Llamada con proveedor')
  }, 60_000)
})
