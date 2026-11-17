import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppLayout } from '../../app/AppLayout'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { ChangePasswordPage } from './ChangePasswordPage'

const { updateUser, rpc } = vi.hoisted(() => ({
  updateUser: vi.fn(() => Promise.resolve({ error: null })),
  rpc: vi.fn(() => Promise.resolve({ error: null })),
}))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { updateUser }, rpc } }))
vi.mock('../notifications/api', () => ({
  listNotifications: vi.fn(() => Promise.resolve([])),
  markNotificationsRead: vi.fn(() => Promise.resolve()),
  subscribeToNotifications: vi.fn(() => () => {}),
}))
vi.mock('../preferences/api', () => ({ saveMyTheme: vi.fn() }))

const routes = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <h1>Calendario</h1> },
      { path: '/cambiar-contrasena', element: <ChangePasswordPage /> },
    ],
  },
]

async function changePassword(mustChange: boolean) {
  const auth = fakeAuth({ status: 'signedIn', profile: fakeProfile({ must_change_password: mustChange }) })
  const router = renderWithAuth(routes, '/cambiar-contrasena', auth)
  await userEvent.type(screen.getByLabelText('Nueva contraseña'), 'Nueva12345')
  await userEvent.type(screen.getByLabelText('Repita la nueva contraseña'), 'Nueva12345')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
  return { router, auth }
}

describe('ChangePasswordPage', () => {
  it('tras cambiar la contraseña temporal pasa solo al inicio y lo confirma', async () => {
    const { router, auth } = await changePassword(true)

    expect(await screen.findByRole('heading', { name: 'Calendario' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('status')).toHaveTextContent('Contraseña actualizada correctamente.')
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
    expect(updateUser).toHaveBeenCalledWith({ password: 'Nueva12345' })
    expect(rpc).toHaveBeenCalledWith('complete_password_change')
    expect(auth.refreshProfile).toHaveBeenCalled()
  })

  it('el cambio voluntario también vuelve al inicio', async () => {
    const { router } = await changePassword(false)
    expect(await screen.findByRole('heading', { name: 'Calendario' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('si falla, se queda en la pantalla y muestra el error', async () => {
    updateUser.mockResolvedValueOnce({ error: { message: 'New password should be different from the old password.' } } as never)
    const { router } = await changePassword(true)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/cambiar-contrasena')
    expect(screen.getByRole('button', { name: 'Guardar contraseña' })).toBeEnabled()
  })
})
