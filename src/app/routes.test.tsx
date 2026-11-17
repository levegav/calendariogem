import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../test/fakeAuth'
import { routes } from './routes'

vi.mock('../features/preferences/api', () => ({ saveMyTheme: vi.fn() }))
vi.mock('../features/calendar/api', () => ({
  listCalendarReminders: vi.fn(() => Promise.resolve([])),
  listPeople: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../features/notifications/api', () => ({
  listNotifications: vi.fn(() => Promise.resolve([])),
  markNotificationsRead: vi.fn(() => Promise.resolve()),
  subscribeToNotifications: vi.fn(() => () => {}),
}))
vi.mock('../features/notifications/decisions', () => ({
  listPendingDecisions: vi.fn(() => Promise.resolve([])),
  resolveDecision: vi.fn(),
}))
vi.mock('../features/categories/api', () => ({ listCategories: vi.fn(() => Promise.resolve([])) }))

const listedUsers = [
  fakeProfile(),
  fakeProfile({ id: '2', username: 'carlos', full_name: 'Carlos Mora', role: 'user', color: '#16a34a' }),
]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: listedUsers, error: null }),
      }),
    }),
  },
}))

describe('rutas protegidas', () => {
  it('muestra "Cargando…" mientras se verifica la sesión', () => {
    renderWithAuth(routes, '/', fakeAuth({ status: 'loading' }))
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
  })

  it('sin sesión redirige al inicio de sesión', async () => {
    const router = renderWithAuth(routes, '/usuarios', fakeAuth({ status: 'signedOut' }))
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('con contraseña temporal obliga a cambiarla y oculta el menú', async () => {
    const router = renderWithAuth(
      routes,
      '/',
      fakeAuth({ status: 'signedIn', profile: fakeProfile({ must_change_password: true }) }),
    )
    expect(await screen.findByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument()
    expect(screen.getByText(/cambie la contraseña temporal/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/cambiar-contrasena')
  })

  it('el usuario estándar no ve ni entra a Usuarios', async () => {
    const router = renderWithAuth(
      routes,
      '/usuarios',
      fakeAuth({ status: 'signedIn', profile: fakeProfile({ role: 'user', full_name: 'Carlos Mora' }) }),
    )
    expect(await screen.findByRole('link', { name: 'Calendario', current: 'page' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('el admin ve la sección de administración y entra a Usuarios', async () => {
    renderWithAuth(routes, '/usuarios', fakeAuth({ status: 'signedIn', profile: fakeProfile() }))
    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Usuarios', current: 'page' })).toBeInTheDocument()
    expect(await screen.findByText('Carlos Mora')).toBeInTheDocument()
  })

  it('el menú lateral lleva al perfil y muestra quién inició sesión', async () => {
    const router = renderWithAuth(routes, '/', fakeAuth({ status: 'signedIn', profile: fakeProfile() }))
    expect(screen.getByRole('link', { name: 'Calendario', current: 'page' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Mi perfil' }))
    // La página del perfil se descarga al abrirla: la dirección cambia al terminar.
    expect(await screen.findByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/perfil')
  })

  it('el botón de salir cierra la sesión', async () => {
    const auth = fakeAuth({ status: 'signedIn', profile: fakeProfile() })
    renderWithAuth(routes, '/', auth)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(auth.signOut).toHaveBeenCalled()
  })

  it('una dirección inexistente muestra "Página no encontrada"', async () => {
    renderWithAuth(routes, '/no-existe', fakeAuth({ status: 'signedIn', profile: fakeProfile() }))
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    cleanup()
  })
})

describe('administración', () => {
  it('el admin ve Categorías en el menú; un usuario no', async () => {
    renderWithAuth(routes, '/categorias', fakeAuth({ status: 'signedIn', profile: fakeProfile() }))
    expect(await screen.findByRole('heading', { name: 'Categorías' })).toBeInTheDocument()
    cleanup()

    const router = renderWithAuth(
      routes,
      '/categorias',
      fakeAuth({ status: 'signedIn', profile: fakeProfile({ role: 'user' }) }),
    )
    expect(await screen.findByRole('link', { name: 'Calendario', current: 'page' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Categorías' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
