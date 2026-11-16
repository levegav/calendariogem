import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeAuth, renderWithAuth } from '../../test/fakeAuth'
import { LoginPage } from './LoginPage'

const routes = [{ path: '/login', element: <LoginPage /> }]

describe('LoginPage', () => {
  it('pide usuario y contraseña antes de enviar', async () => {
    const auth = fakeAuth({ status: 'signedOut' })
    renderWithAuth(routes, '/login', auth)

    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Ingrese su usuario y contraseña.')
    expect(auth.signIn).not.toHaveBeenCalled()
  })

  it('envía el usuario y la contraseña', async () => {
    const auth = fakeAuth({ status: 'signedOut' })
    renderWithAuth(routes, '/login', auth)

    await userEvent.type(screen.getByLabelText('Usuario'), 'ana')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave2026')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(auth.signIn).toHaveBeenCalledWith('ana', 'Clave2026')
  })

  it('muestra un mensaje claro si las credenciales son incorrectas', async () => {
    const auth = fakeAuth(
      { status: 'signedOut' },
      { signIn: vi.fn().mockRejectedValue({ code: 'invalid_credentials', message: 'Invalid login credentials' }) },
    )
    renderWithAuth(routes, '/login', auth)

    await userEvent.type(screen.getByLabelText('Usuario'), 'ana')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala1234')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
  })

  it('permite ver la contraseña mientras se escribe', async () => {
    renderWithAuth(routes, '/login', fakeAuth({ status: 'signedOut' }))
    const input = screen.getByLabelText('Contraseña')
    await userEvent.type(input, 'Clave2026')
    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('Clave2026')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('muestra el aviso de usuario desactivado', () => {
    renderWithAuth(
      routes,
      '/login',
      fakeAuth({ status: 'signedOut', notice: 'Su usuario está desactivado. Consulte al administrador.' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Su usuario está desactivado.')
  })
})
