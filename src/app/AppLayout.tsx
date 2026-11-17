import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Icon, type IconName } from '../components/Icon'
import { UserAvatar } from '../components/UserAvatar'
import { useAuth } from '../features/auth/AuthContext'
import { NotificationBell } from '../features/notifications/NotificationBell'
import { NotificationsProvider } from '../features/notifications/NotificationsProvider'
import { isAdmin, ROLE_LABELS } from '../lib/auth'
import { isThemePreference, watchTheme } from '../lib/theme'
import styles from './AppLayout.module.css'

function NavItem({ to, icon, label, end }: { to: string; icon: IconName; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={styles.navItem}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  )
}

export function AppLayout() {
  const { state, signOut } = useAuth()
  const profile = state.status === 'signedIn' ? state.profile : null
  const showNav = Boolean(profile && !profile.must_change_password)
  const location = useLocation()
  // Aviso de una sola vez que deja otra pantalla al navegar (p. ej. tras cambiar la contraseña).
  const notice = (location.state as { notice?: string } | null)?.notice
  // En celular el menú lateral es un panel que se abre con ☰.
  const [menuOpen, setMenuOpen] = useState(false)
  const theme = profile && isThemePreference(profile.theme) ? profile.theme : 'sistema'

  useEffect(() => watchTheme(theme), [theme])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const shell = (
    <div className={styles.shell}>
      {showNav && profile && (
        <>
          <aside id="menu-principal" className={styles.sidebar} data-open={menuOpen}>
            <div className={styles.brandRow}>
              <Link to="/" className={styles.brand} onClick={() => setMenuOpen(false)}>
                <img src="/favicon.svg" alt="" width={28} height={28} />
                Calendario GEM
              </Link>
              <span className={styles.sidebarBell}>
                <NotificationBell align="start" />
              </span>
            </div>

            <nav className={styles.nav} aria-label="Principal" onClick={() => setMenuOpen(false)}>
              <NavItem to="/" end icon="calendar" label="Calendario" />
              <NavItem to="/perfil" icon="user" label="Mi perfil" />
              {isAdmin(profile.role) && (
                <>
                  <p className={styles.navSection}>Administración</p>
                  <NavItem to="/usuarios" icon="users" label="Usuarios" />
                  <NavItem to="/categorias" icon="tag" label="Categorías" />
                </>
              )}
            </nav>

            <div className={styles.account}>
              <Link to="/perfil" className={styles.accountLink} onClick={() => setMenuOpen(false)}>
                <UserAvatar name={profile.full_name} color={profile.color} size={32} />
                <span className={styles.accountText}>
                  <strong>{profile.full_name}</strong>
                  <small>{ROLE_LABELS[profile.role]}</small>
                </span>
              </Link>
              <button
                type="button"
                className="icon-btn"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                onClick={() => void signOut()}
              >
                <Icon name="logout" />
              </button>
            </div>
          </aside>
          {menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} aria-hidden="true" />}
        </>
      )}

      <div className={styles.content}>
        <header className={styles.topbar} data-nav={showNav}>
          {showNav && (
            <button
              type="button"
              className={`icon-btn ${styles.menuButton}`}
              aria-label="Menú"
              aria-expanded={menuOpen}
              aria-controls="menu-principal"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          )}
          <Link to="/" className={styles.topbarBrand}>
            <img src="/favicon.svg" alt="" width={24} height={24} />
            Calendario GEM
          </Link>
          {showNav && (
            <span className={styles.topbarBell}>
              <NotificationBell align="end" />
            </span>
          )}
          {!showNav && profile && (
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Salir
            </button>
          )}
        </header>

        <main className={styles.main}>
          {notice && (
            <p className={`alert alert-success ${styles.notice}`} role="status">
              {notice}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )

  // Las notificaciones solo corren con sesión completa (no durante el cambio de contraseña).
  return showNav && profile ? (
    <NotificationsProvider key={profile.id} userId={profile.id}>
      {shell}
    </NotificationsProvider>
  ) : (
    shell
  )
}
