import type { RouteObject } from 'react-router'
import { LoginPage } from '../features/auth/LoginPage'
import { CHANGE_PASSWORD_PATH, RequireAuth, RequireRole } from '../features/auth/RequireAuth'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { AppLayout } from './AppLayout'
import { NotFoundPage } from './NotFoundPage'

// El calendario y el inicio de sesión van en el paquete principal; las demás
// páginas se descargan la primera vez que se abren.
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <CalendarPage /> },
          {
            path: 'perfil',
            lazy: async () => ({ Component: (await import('../features/profile/ProfilePage')).ProfilePage }),
          },
          {
            path: CHANGE_PASSWORD_PATH,
            lazy: async () => ({ Component: (await import('../features/auth/ChangePasswordPage')).ChangePasswordPage }),
          },
          {
            element: <RequireRole roles={['admin']} />,
            children: [
              {
                path: 'usuarios',
                lazy: async () => ({ Component: (await import('../features/users/UsersPage')).UsersPage }),
              },
              {
                path: 'categorias',
                lazy: async () => ({ Component: (await import('../features/categories/CategoriesPage')).CategoriesPage }),
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
