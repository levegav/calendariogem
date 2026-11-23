import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { createUser, listUsers, resetUserPassword, setUserActive, updateUser } from './api'
import { listOutlookLinks, setOutlookEmail, syncOutlookNow } from './outlook'
import { UsersPage } from './UsersPage'

vi.mock('./outlook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./outlook')>()),
  listOutlookLinks: vi.fn(),
  setOutlookEmail: vi.fn(),
  syncOutlookNow: vi.fn(),
}))
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
  vi.mocked(listOutlookLinks).mockResolvedValue([])
  vi.mocked(setOutlookEmail).mockResolvedValue(undefined)
  vi.mocked(syncOutlookNow).mockResolvedValue({ usuarios: 1, sin_cambios: 0, actualizado: 1, en_espera: 0, error: 0 })
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

  it('al crear un usuario se le puede dar acceso al calendario general', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
    await userEvent.type(screen.getByLabelText('Usuario'), 'maria')
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'María Pérez')
    const access = screen.getByRole('checkbox', { name: /Acceso al calendario general/ })
    expect(access).not.toBeChecked()
    await userEvent.click(access)
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'maria', general_access: true }))
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
      general_access: false,
    })
    expect(await screen.findByText('Usuario actualizado.')).toBeInTheDocument()
  })

  it('da acceso al calendario general y lo muestra en la lista', async () => {
    renderPage()
    const card = (await screen.findByText('Carlos Mora')).closest('li')!
    expect(within(card).queryByText('Calendario general')).not.toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Editar' }))
    await userEvent.click(within(card).getByRole('checkbox', { name: /Acceso al calendario general/ }))
    vi.mocked(listUsers).mockResolvedValue([{ ...carlos, general_access: true }, admin])
    await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }))

    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'carlos', general_access: true }))
    const updated = (await screen.findByText('Usuario actualizado.')) && (await screen.findByText('Carlos Mora')).closest('li')!
    expect(await within(updated).findByText('Calendario general')).toBeInTheDocument()
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

  describe('Outlook', () => {
    it('al crear un usuario se le puede poner su correo de Outlook (y se valida)', async () => {
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: 'Nuevo usuario' }))
      await userEvent.type(screen.getByLabelText('Usuario'), 'maria')
      await userEvent.type(screen.getByLabelText('Nombre completo'), 'María Pérez')
      const email = screen.getByRole('textbox', { name: /Correo de Outlook/ })
      await userEvent.type(email, 'maria-empresa')
      await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
      expect(screen.getByRole('alert')).toHaveTextContent('El correo de Outlook no es válido.')
      expect(createUser).not.toHaveBeenCalled()

      await userEvent.clear(email)
      await userEvent.type(email, ' Maria.Perez@Empresa.com ')
      await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))
      expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ outlook_email: 'maria.perez@empresa.com' }))
    })

    it('muestra el estado de la sincronización y el problema si lo hay', async () => {
      vi.mocked(listOutlookLinks).mockResolvedValue([
        {
          user_id: 'carlos',
          email: 'carlos@empresa.com',
          status: 'sin_permiso',
          status_detail: 'La cuenta de servicio no tiene permiso de Revisor sobre este calendario.',
          checked_at: '2026-11-16T16:00:00Z',
          refreshed_at: null,
        },
      ])
      renderPage()
      const card = (await screen.findByText('Carlos Mora')).closest('li')!
      expect(within(card).getByText(/carlos@empresa\.com/)).toBeInTheDocument()
      expect(within(card).getByText('Outlook: sin permiso en Exchange')).toBeInTheDocument()
      expect(within(card).getByText(/no tiene permiso de Revisor/)).toBeInTheDocument()
    })

    it('al editar cambia el correo solo si es distinto, y se puede sincronizar ahora', async () => {
      vi.mocked(listOutlookLinks).mockResolvedValue([
        { user_id: 'carlos', email: 'carlos@empresa.com', status: 'ok', status_detail: null, checked_at: null, refreshed_at: null },
      ])
      renderPage()
      const card = (await screen.findByText('Carlos Mora')).closest('li')!
      await userEvent.click(within(card).getByRole('button', { name: 'Editar' }))
      const email = within(card).getByRole('textbox', { name: /Correo de Outlook/ })
      expect(email).toHaveValue('carlos@empresa.com')
      await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }))
      expect(setOutlookEmail).not.toHaveBeenCalled()

      await userEvent.click(within(card).getByRole('button', { name: 'Editar' }))
      await userEvent.clear(within(card).getByRole('textbox', { name: /Correo de Outlook/ }))
      await userEvent.click(within(card).getByRole('button', { name: 'Guardar' }))
      expect(setOutlookEmail).toHaveBeenCalledWith('carlos', '')

      await userEvent.click(screen.getByRole('button', { name: 'Sincronizar Outlook' }))
      expect(syncOutlookNow).toHaveBeenCalled()
      expect(await screen.findByText('Outlook sincronizado: 1 calendario revisado.')).toBeInTheDocument()
    })
  })
})
