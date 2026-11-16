import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import { AuthContext, type AuthContextValue, type AuthState, type Profile } from '../features/auth/AuthContext'

export function fakeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    username: 'ana',
    full_name: 'Ana Rodríguez',
    role: 'admin',
    active: true,
    must_change_password: false,
    color: '#2563eb',
    theme: 'sistema',
    ...overrides,
  }
}

export function fakeAuth(state: AuthState, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    state,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

export function renderWithAuth(routes: RouteObject[], path: string, auth: AuthContextValue) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}
