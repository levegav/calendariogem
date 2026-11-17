import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { toSpanishMessage } from '../../lib/errors'
import type { PendingDecision } from './decisions'
import { formatWhen } from './messages'
import styles from './notifications.module.css'

/**
 * Ventana Conservar / Eliminar. No se puede cerrar sin decidir; si hay varias,
 * salen una por una (de la más vieja a la más nueva).
 */
export function DecisionDialog({
  decision,
  remaining,
  onResolve,
}: {
  decision: PendingDecision
  /** Cuántas quedan pendientes, contando esta. */
  remaining: number
  onResolve: (keep: boolean) => Promise<void>
}) {
  const [busy, setBusy] = useState<'conservar' | 'eliminar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const owner = decision.former_owner?.full_name ?? 'El creador'
  const deleted = decision.reason === 'eliminado'

  async function resolve(keep: boolean) {
    setError(null)
    setBusy(keep ? 'conservar' : 'eliminar')
    try {
      await onResolve(keep)
    } catch (err) {
      setError(toSpanishMessage(err))
      setBusy(null)
    }
  }

  return (
    <Modal
      title={deleted ? 'Recordatorio eliminado' : 'Creador desactivado'}
      dismissible={false}
      accentColor={decision.former_owner?.color}
      onClose={() => {}}
      footer={
        <>
          <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void resolve(false)}>
            {busy === 'eliminar' ? 'Quitando…' : 'Eliminar de mi calendario'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-autofocus
            disabled={busy !== null}
            onClick={() => void resolve(true)}
          >
            {busy === 'conservar' ? 'Guardando…' : 'Conservar una copia'}
          </button>
        </>
      }
    >
      <div className="stack">
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <p>
          {deleted ? (
            <>
              <strong>{owner}</strong> eliminó un recordatorio en el que le había etiquetado.
            </>
          ) : (
            <>
              La cuenta de <strong>{owner}</strong> fue desactivada, y este recordatorio suyo le incluye.
            </>
          )}
        </p>
        <div className={styles.alertItem}>
          <strong className={styles.alertTitle}>{decision.title}</strong>
          <span>{formatWhen(decision.start_at, decision.all_day)}</span>
          {decision.location && <span className="muted">{decision.location}</span>}
        </div>
        <p>
          ¿Quiere conservar una copia en su calendario? La copia será suya: podrá modificarla o eliminarla.
        </p>
        {remaining > 1 && (
          <p className="muted">
            {remaining === 2 ? 'Queda 1 más' : `Quedan ${remaining - 1} más`} por decidir después de este.
          </p>
        )}
      </div>
    </Modal>
  )
}
