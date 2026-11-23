import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from '../../app/AppLayout'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { listNotifications, markNotificationsRead, subscribeToNotifications } from './api'
import { listPendingDecisions, resolveDecision, type PendingDecision } from './decisions'
import { playChime } from './sound'
import type { AppNotification } from './types'

vi.mock('./api', () => ({
  listNotifications: vi.fn(),
  markNotificationsRead: vi.fn(() => Promise.resolve()),
  subscribeToNotifications: vi.fn(),
}))
vi.mock('./decisions', () => ({
  listPendingDecisions: vi.fn(),
  resolveDecision: vi.fn(),
}))
vi.mock('./sound', () => ({
  playChime: vi.fn(),
  unlockSound: vi.fn(),
  isSoundEnabled: vi.fn(() => true),
  setSoundEnabled: vi.fn(),
}))
vi.mock('../preferences/api', () => ({ saveMyTheme: vi.fn() }))

const carlos = { id: 'carlos', full_name: 'Carlos Mora', color: '#16a34a' }

function fake(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 1,
    kind: 'etiquetado',
    reminder_id: 10,
    reminder_title: 'Reunión de equipo',
    data: { start_at: '2026-11-18T14:00:00-06:00', all_day: false },
    created_at: new Date().toISOString(),
    read_at: null,
    actor: carlos,
    ...overrides,
  }
}

const aviso = (id: number) =>
  fake({ id, kind: 'aviso', actor: null, data: { start_at: '2026-11-18T14:00:00-06:00', all_day: false, minutes_before: 15 } })

const routes = [{ element: <AppLayout />, children: [{ path: '/', element: <h1>Calendario</h1> }] }]

/** Simula que llega una notificación en tiempo real. */
let pushInsert: () => void = () => {}

function renderApp() {
  return renderWithAuth(routes, '/', fakeAuth({ status: 'signedIn', profile: fakeProfile({ must_change_password: false }) }))
}

/** La campana aparece en el menú lateral y en el encabezado (cada uno se muestra según el ancho). */
const bell = () => screen.getAllByRole('button', { name: /^Notificaciones/ })[0]

beforeEach(() => {
  vi.mocked(markNotificationsRead).mockClear()
  vi.mocked(playChime).mockClear()
  localStorage.clear()
  vi.mocked(listPendingDecisions).mockResolvedValue([])
  vi.mocked(resolveDecision).mockReset().mockResolvedValue(undefined)
  vi.mocked(subscribeToNotifications).mockImplementation((_userId, onInsert) => {
    pushInsert = onInsert
    return () => {}
  })
})

describe('NotificationsProvider y campana', () => {
  it('muestra cuántas hay sin leer y marca como "Perdido" los avisos que llegaron con la app cerrada', async () => {
    vi.mocked(listNotifications).mockResolvedValue([aviso(2), fake({ id: 1 }), fake({ id: 3, kind: 'salida', read_at: '2026-11-17T10:00:00Z' })])
    renderApp()
    expect(await screen.findAllByRole('button', { name: 'Notificaciones (2 sin leer)' })).toHaveLength(2)
    await waitFor(() => expect(document.title).toBe('(2) Calendario GEM'))

    await userEvent.click(bell())
    const panel = screen.getByRole('region', { name: 'Notificaciones' })
    expect(within(panel).getByText('Perdido')).toBeInTheDocument()
    expect(within(panel).getByText('Carlos Mora le etiquetó en «Reunión de equipo».')).toBeInTheDocument()
    // Al cargar no se abre la ventana de avisos: los perdidos quedan en la campana.
    // Suena una sola vez, porque llegaron mientras no estaba (hay un aviso previo entre ellos).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(playChime).toHaveBeenCalledTimes(1)
    expect(playChime).toHaveBeenCalledWith('aviso')

    await userEvent.click(within(panel).getByRole('button', { name: 'Marcar todas como leídas' }))
    expect(markNotificationsRead).toHaveBeenCalledWith([2, 1])
    expect(screen.getAllByRole('button', { name: 'Notificaciones' })).toHaveLength(2)
  })

  it('al volver a entrar no suena por las que ya se anunciaron', async () => {
    vi.mocked(listNotifications).mockResolvedValue([fake({ id: 1 })])
    renderApp()
    await screen.findAllByRole('button', { name: 'Notificaciones (1 sin leer)' })
    await waitFor(() => expect(playChime).toHaveBeenCalledWith('notificacion'))
    cleanup()
    vi.mocked(playChime).mockClear()

    renderApp()
    await screen.findAllByRole('button', { name: 'Notificaciones (1 sin leer)' })
    expect(playChime).not.toHaveBeenCalled()
  })

  it('al entrar no suena si no llegó nada nuevo sin leer', async () => {
    vi.mocked(listNotifications).mockResolvedValue([fake({ id: 3, read_at: '2026-11-17T10:00:00Z' })])
    renderApp()
    await screen.findAllByRole('button', { name: 'Notificaciones' })
    expect(playChime).not.toHaveBeenCalled()
  })

  it('un aviso previo que llega con la app abierta sale en una ventana', async () => {
    vi.mocked(listNotifications).mockResolvedValue([])
    renderApp()
    await screen.findAllByRole('button', { name: 'Notificaciones' })

    vi.mocked(listNotifications).mockResolvedValue([aviso(7)])
    await act(async () => pushInsert())

    const dialog = await screen.findByRole('dialog', { name: 'Aviso' })
    expect(playChime).toHaveBeenCalledWith('aviso')
    expect(within(dialog).getByText('Reunión de equipo')).toBeInTheDocument()
    expect(within(dialog).getByText('Empieza en 15 min')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entendido' }))
    expect(markNotificationsRead).toHaveBeenCalledWith([7])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Ya visto en esta sesión: no se marca como perdido.
    await userEvent.click(bell())
    expect(screen.queryByText('Perdido')).not.toBeInTheDocument()
  })

  it('las demás notificaciones nuevas salen como mensaje breve y llevan al día del recordatorio', async () => {
    vi.mocked(listNotifications).mockResolvedValue([])
    const router = renderApp()
    await screen.findAllByRole('button', { name: 'Notificaciones' })

    vi.mocked(listNotifications).mockResolvedValue([fake({ id: 9 })])
    await act(async () => pushInsert())

    const toasts = screen.getByRole('status', { name: 'Notificaciones nuevas' })
    const message = await within(toasts).findByRole('button', { name: /Carlos Mora le etiquetó en «Reunión de equipo»/ })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(playChime).toHaveBeenCalledWith('notificacion')
    await userEvent.click(message)
    expect(markNotificationsRead).toHaveBeenCalledWith([9])
    expect(router.state.location.search).toBe('?vista=dia&fecha=2026-11-18')
  })

  it('sin notificaciones lo indica', async () => {
    vi.mocked(listNotifications).mockResolvedValue([])
    renderApp()
    await screen.findAllByRole('button', { name: 'Notificaciones' })
    await userEvent.click(bell())
    expect(screen.getByText('No tiene notificaciones.')).toBeInTheDocument()
  })

  describe('ventana Conservar / Eliminar', () => {
    const decision = (overrides: Partial<PendingDecision>): PendingDecision => ({
      id: 1,
      reason: 'eliminado',
      outlook_organizer: null,
      title: 'Comité de compras',
      start_at: '2026-11-20T14:00:00-06:00',
      end_at: null,
      all_day: false,
      location: 'Sala 2',
      created_at: '2026-11-17T10:00:00Z',
      former_owner: carlos,
      ...overrides,
    })

    it('al entrar presenta las pendientes una por una y no se puede cerrar sin decidir', async () => {
      vi.mocked(listNotifications).mockResolvedValue([])
      vi.mocked(listPendingDecisions).mockResolvedValue([
        decision({ id: 1 }),
        decision({ id: 2, reason: 'creador_desactivado', title: 'Visita a planta' }),
      ])
      renderApp()

      const first = await screen.findByRole('dialog', { name: 'Recordatorio eliminado' })
      expect(within(first).getByText('Comité de compras')).toBeInTheDocument()
      expect(within(first).getByText('vie 20 nov, 2:00 p. m.')).toBeInTheDocument()
      expect(within(first).getByText('Queda 1 más por decidir después de este.')).toBeInTheDocument()
      expect(within(first).queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(screen.getByRole('dialog', { name: 'Recordatorio eliminado' })).toBeInTheDocument()

      await userEvent.click(within(first).getByRole('button', { name: 'Conservar una copia' }))
      expect(resolveDecision).toHaveBeenCalledWith(1, true)

      const second = await screen.findByRole('dialog', { name: 'Creador desactivado' })
      expect(within(second).getByText('Visita a planta')).toBeInTheDocument()
      await userEvent.click(within(second).getByRole('button', { name: 'Eliminar de mi calendario' }))
      expect(resolveDecision).toHaveBeenLastCalledWith(2, false)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      // Las que encontró al entrar suenan una sola vez.
      expect(playChime).toHaveBeenCalledTimes(1)
    })

    it('una reunión de Outlook cancelada se puede conservar como recordatorio', async () => {
      vi.mocked(listNotifications).mockResolvedValue([])
      vi.mocked(listPendingDecisions).mockResolvedValue([
        decision({ id: 5, reason: 'outlook_cancelada', title: 'Visita al cliente', former_owner: null, outlook_organizer: 'Ana Mora' }),
      ])
      renderApp()
      const dialog = await screen.findByRole('dialog', { name: 'Reunión cancelada en Outlook' })
      expect(within(dialog).getByText('Ana Mora')).toBeInTheDocument()
      expect(within(dialog).getByText(/conservarla como recordatorio/)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conservar una copia' }))
      expect(resolveDecision).toHaveBeenCalledWith(5, true)
    })

    it('si no se puede guardar la decisión, lo indica y la ventana sigue', async () => {
      vi.mocked(listNotifications).mockResolvedValue([])
      vi.mocked(listPendingDecisions).mockResolvedValue([decision({})])
      vi.mocked(resolveDecision).mockRejectedValue(new Error('sin conexión'))
      renderApp()
      const dialog = await screen.findByRole('dialog', { name: 'Recordatorio eliminado' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Conservar una copia' }))
      expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Conservar una copia' })).toBeEnabled()
    })

    it('una decisión nueva con la app abierta sale de inmediato, con sonido', async () => {
      vi.mocked(listNotifications).mockResolvedValue([])
      renderApp()
      await screen.findAllByRole('button', { name: 'Notificaciones' })
      vi.mocked(listPendingDecisions).mockResolvedValue([decision({ id: 5 })])
      await act(async () => pushInsert())
      expect(await screen.findByRole('dialog', { name: 'Recordatorio eliminado' })).toBeInTheDocument()
      expect(playChime).toHaveBeenCalledWith('aviso')
    })
  })
})
