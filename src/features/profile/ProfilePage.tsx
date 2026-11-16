import { useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { UserAvatar } from '../../components/UserAvatar'
import { ROLE_LABELS } from '../../lib/auth'
import { toSpanishMessage } from '../../lib/errors'
import { isThemePreference, THEME_LABELS, THEME_OPTIONS, type ThemePreference } from '../../lib/theme'
import { useAuth } from '../auth/AuthContext'
import { saveMyTheme } from '../preferences/api'
import styles from './ProfilePage.module.css'

export function ProfilePage() {
  const { state, refreshProfile } = useAuth()
  const [saving, setSaving] = useState<ThemePreference | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (state.status !== 'signedIn') return null
  const { profile } = state
  const theme: ThemePreference = saving ?? (isThemePreference(profile.theme) ? profile.theme : 'sistema')

  async function chooseTheme(next: ThemePreference) {
    setError(null)
    setSaving(next)
    try {
      await saveMyTheme(next)
      await refreshProfile()
    } catch (err) {
      setError(toSpanishMessage(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="stack narrow-wide">
      <h1>Mi perfil</h1>

      <div className={`card ${styles.identity}`} style={{ borderLeftColor: profile.color }}>
        <UserAvatar name={profile.full_name} color={profile.color} size={64} />
        <div className={styles.details}>
          <h2>{profile.full_name}</h2>
          <p className="muted">Usuario: {profile.username}</p>
          <span className="badge">{ROLE_LABELS[profile.role]}</span>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2>Color identificador</h2>
          <p className="muted">
            Sus recordatorios llevan esta línea de color en todos los calendarios, para que los demás sepan que los
            creó usted.
          </p>
        </div>
        <div className={styles.colorSample}>
          <span className={styles.swatch} style={{ background: profile.color }} aria-hidden="true" />
          <span className={styles.hex}>{profile.color.toUpperCase()}</span>
          <div className={styles.preview} style={{ borderLeftColor: profile.color }}>
            <strong>Ejemplo de recordatorio</strong>
            <small className="muted">Creado por: {profile.full_name}</small>
          </div>
        </div>
        <small className="muted">Solo el administrador puede cambiar su nombre y su color.</small>
      </div>

      <div className="card stack">
        <fieldset className="segmented">
          <legend>Apariencia</legend>
          {THEME_OPTIONS.map((option) => (
            <label key={option} className={theme === option ? 'is-selected' : undefined}>
              <input
                type="radio"
                name="apariencia"
                value={option}
                checked={theme === option}
                disabled={saving !== null}
                onChange={() => void chooseTheme(option)}
              />
              {THEME_LABELS[option]}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="card stack">
        <h2>Seguridad</h2>
        <div>
          <Link to="/cambiar-contrasena" className="btn btn-secondary">
            <Icon name="key" size={18} />
            Cambiar contraseña
          </Link>
        </div>
      </div>
    </section>
  )
}
