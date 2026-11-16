import { Navigate, Outlet, useLocation } from 'react-router'
import type { UserRole } from '../../lib/auth'
import { useAuth } from './AuthContext'

export const CHANGE_PASSWORD_PATH = '/cambiar-contrasena'

/** Exige sesión iniciada y, si corresponde, el cambio de la contraseña temporal. */
export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') {
    return <p className="page-loading">Cargando…</p>
  }
  if (state.status === 'signedOut') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (state.profile.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  }
  return <Outlet />
}

/** Oculta rutas a roles no autorizados (la base de datos aplica el permiso real). */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { state } = useAuth()
  if (state.status !== 'signedIn' || !roles.includes(state.profile.role)) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
