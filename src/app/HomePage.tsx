import { Icon } from '../components/Icon'
import { useAuth } from '../features/auth/AuthContext'

/** Inicio provisional: el calendario se construye en la Fase 2. */
export function HomePage() {
  const { state } = useAuth()
  const firstName = state.status === 'signedIn' ? state.profile.full_name.split(' ')[0] : ''

  return (
    <section className="stack">
      <h1>Hola, {firstName}</h1>
      <div className="card empty-state">
        <Icon name="calendar" size={40} />
        <h2>Su calendario estará aquí muy pronto</h2>
        <p className="muted">Estamos preparando las vistas de día, semana, mes y año, y la creación de recordatorios.</p>
      </div>
    </section>
  )
}
