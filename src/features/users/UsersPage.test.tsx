import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { createUser, listUsers, resetUserPassword, setUserActive, updateUser } from './api'
import { UsersPage } from './UsersPage'

vi.mock('./api', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserActive: vi.fn(),
  resetUserPassword: vi.fn(),
}))

const admin = fakeProfile({ id: 'admin', full_name: 'Luis Vega', username: 'luis', color: '#2563eb' })
const carlos = fakeProfile({ id: 'carlos', full_name: 'Carlos Mora', username: 'carlos', role: 'user', color: '#16a34a' })
const routes = [{ path: '/usuarios', element: <UsersPage /> }]

function renderPage() {
  return renderWithAuth(routes, '/usuarios', fakeAuth({ status: 'signedIn', profile: admin }))
}

beforeEach(() => {
  vi.mocked(listUsers).mockResolvedValue([carlos, admin])
  vi.mocked(createUser).mockResolvedValue({ id: 'nuevo', username: 'maria' })
  vi.mocked(updateUser).mockResolvedValue(undefined)
  vi.mocked(setUserActive).mockResolvedValue(undefined)
  vi.mocked(resetUserPassword).mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('UsersPage', () => {
  it('lista los usuarios con su color y estado', async () => {
    renderPage()
    expect(await screen.findByText('Carlos Mora')).toBeInTheDocument()
    expect(screen.getByText('#16A34A')).toBeInTheDocument()
    expect(screen.getByText('2 activos de 2')).toBeInTheDocument()
  })

  it('crea un usuario con un color libre sugerido y muestra la contraseña temporal', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    await userEvent.type(screen.getByLabelText('Usuario'), 'Maria')
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'María Pérez')
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'maria', full_name: 'María Pérez', role: 'user', color: '#ea580c' }),
    )
    expect(await screen.findByText('Usuario creado correctamente.')).toBeInTheDocument()
    expect(screen.getByText('Contraseña temporal')).toBeInTheDocument()
  })

  it('no deja elegir un color que ya usa otro usuario', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    await userEvent.type(screen.getByLabelText('Usuario'), 'maria')
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'María Pérez')
    // El color sugerido en uso está deshabilitado; el panel personalizado tampoco deja usarlo.
    expect(screen.getByRole('button', { name: '#16A34A, en uso por Carlos Mora' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Color personalizado' }))
    await userEvent.click(screen.getByText('Valores exactos (HEX / RGB)'))
    const hex = screen.getByRole('textbox', { name: 'HEX' })
    await userEvent.clear(hex)
    await userEvent.type(hex, '#16A34A')
    expect(screen.getByRole('button', { name: 'Usar este color' })).toBeDisabled()
    await userEvent.click(within(screen.getByRole('group', { name: 'Color personalizado' })).getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    // Se crea con el color libre que ya tenía, nunca con el de Carlos.
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ color: '#ea580c' }))
  })

  it('edita el color de un usuario', async () => {
    renderPage()
    const card = (await screen.findByText('Carlos Mora')).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }))
    await userEvent.click(within(card).getByRole('button', { name: '#9333EA' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }))

    expect(updateUser).toHaveBeenCalledWith({
      id: 'carlos',
      full_name: 'Carlos Mora',
      role: 'user',
      active: true,
      color: '#9333ea',
    })
    expect(await screen.findByText('Usuario actualizado.')).toBeInTheDocument()
  })

  it('desactiva a otro usuario tras confirmar', async () => {
    renderPage()
    const card = (await screen.findByText('Carlos Mora')).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: 'Desactivar' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('su información y recordatorios se conservan'))
    expect(setUserActive).toHaveBeenCalledWith('carlos', false)
  })

  it('el admin no puede desactivarse ni restablecerse a sí mismo', async () => {
    renderPage()
    const card = (await screen.findByText('Luis Vega')).closest('li')!
    expect(within(card).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Restablecer contraseña' })).not.toBeInTheDocument()
  })
})
