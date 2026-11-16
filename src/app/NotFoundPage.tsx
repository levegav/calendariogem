import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section>
      <h1>Página no encontrada</h1>
      <p className="muted">
        La dirección no existe. <Link to="/">Volver al inicio</Link>
      </p>
    </section>
  )
}
