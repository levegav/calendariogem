import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppLayout } from '../../app/AppLayout'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { listNotifications, markNotificationsRead, subscribeToNotifications } from './api'
import type { AppNotification } from './types'

vi.mock('./api', () => ({
  listNotifications: vi.fn(),
  markNotificationsRead: vi.fn(() => Promise.resolve()),
  subscribeToNotifications: vi.fn(),
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
    // Al cargar no se abre la ventana de avisos: los perdidos solo quedan en la campana.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Marcar todas como leídas' }))
    expect(markNotificationsRead).toHaveBeenCalledWith([2, 1])
    expect(screen.getAllByRole('button', { name: 'Notificaciones' })).toHaveLength(2)
  })

  it('un aviso previo que llega con la app abierta sale en una ventana', async () => {
    vi.mocked(listNotifications).mockResolvedValue([])
    renderApp()
    await screen.findAllByRole('button', { name: 'Notificaciones' })

    vi.mocked(listNotifications).mockResolvedValue([aviso(7)])
    await act(async () => pushInsert())

    const dialog = await screen.findByRole('dialog', { name: 'Aviso' })
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
})
