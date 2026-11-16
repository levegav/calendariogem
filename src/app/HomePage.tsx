import { useEffect, useState } from 'react'
import { checkServer, type ServerStatus } from '../lib/health'

type Status = ServerStatus | 'checking'

const STATUS_TEXT: Record<Status, string> = {
  checking: 'Comprobando conexión con el servidor…',
  ok: 'Conexión con el servidor: correcta',
  error: 'No se pudo conectar con el servidor',
}

/** Página temporal de la Fase 0: confirma que la app está publicada y conectada. */
export function HomePage({ check = checkServer }: { check?: () => Promise<ServerStatus> }) {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let active = true
    check().then((result) => {
      if (active) setStatus(result)
    })
    return () => {
      active = false
    }
  }, [check])

  return (
    <main className="splash">
      <div className="splash-card">
        <img src="/favicon.svg" alt="" width={56} height={56} />
        <h1>Calendario GEM</h1>
        <p className="splash-sub">En construcción · Fase 0</p>
        <p className={`status status-${status}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {STATUS_TEXT[status]}
        </p>
      </div>
    </main>
  )
}
