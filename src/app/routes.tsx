import type { RouteObject } from 'react-router'
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage'
import { LoginPage } from '../features/auth/LoginPage'
import { CHANGE_PASSWORD_PATH, RequireAuth, RequireRole } from '../features/auth/RequireAuth'
import { ProfilePage } from '../features/profile/ProfilePage'
import { UsersPage } from '../features/users/UsersPage'
import { AppLayout } from './AppLayout'
import { HomePage } from './HomePage'
import { NotFoundPage } from './NotFoundPage'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'perfil', element: <ProfilePage /> },
          { path: CHANGE_PASSWORD_PATH, element: <ChangePasswordPage /> },
          {
            element: <RequireRole roles={['admin']} />,
            children: [{ path: 'usuarios', element: <UsersPage /> }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
