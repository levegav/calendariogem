import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeAuth, fakeProfile, renderWithAuth } from '../../test/fakeAuth'
import { saveMyTheme } from '../preferences/api'
import { ProfilePage } from './ProfilePage'

vi.mock('../preferences/api', () => ({ saveMyTheme: vi.fn().mockResolvedValue(undefined) }))

const routes = [{ path: '/perfil', element: <ProfilePage /> }]

describe('ProfilePage', () => {
  it('muestra nombre, usuario, rol y color identificador', () => {
    renderWithAuth(
      routes,
      '/perfil',
      fakeAuth({ status: 'signedIn', profile: fakeProfile({ role: 'user', color: '#16a34a' }) }),
    )
    expect(screen.getByRole('heading', { name: 'Ana Rodríguez' })).toBeInTheDocument()
    expect(screen.getByText('Usuario: ana')).toBeInTheDocument()
    expect(screen.getByText('Usuario', { selector: '.badge' })).toBeInTheDocument()
    expect(screen.getByText('#16A34A')).toBeInTheDocument()
    expect(screen.getByText('Creado por: Ana Rodríguez')).toBeInTheDocument()
  })

  it('guarda la apariencia elegida y recarga el perfil', async () => {
    const auth = fakeAuth({ status: 'signedIn', profile: fakeProfile() })
    renderWithAuth(routes, '/perfil', auth)
    await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    expect(saveMyTheme).toHaveBeenCalledWith('oscuro')
    expect(auth.refreshProfile).toHaveBeenCalled()
  })
})
