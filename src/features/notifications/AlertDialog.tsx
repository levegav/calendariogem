import { Modal } from '../../components/Modal'
import { alertMoment } from './alerts'
import { notificationText } from './messages'
import styles from './notifications.module.css'
import type { AppNotification } from './types'

/** Ventana de avisos previos que llegan con la app abierta. Se cierra con "Entendido". */
export function AlertDialog({
  alerts,
  onAcknowledge,
  onOpen,
}: {
  alerts: AppNotification[]
  onAcknowledge: () => void
  onOpen: (notification: AppNotification) => void
}) {
  const single = alerts.length === 1
  return (
    <Modal
      title={single ? 'Aviso' : `${alerts.length} avisos`}
      onClose={onAcknowledge}
      footer={
        <>
          {single && (
            <button type="button" className="btn btn-secondary" onClick={() => onOpen(alerts[0])}>
              Ver en el calendario
            </button>
          )}
          <button type="button" className="btn btn-primary" data-autofocus onClick={onAcknowledge}>
            Entendido
          </button>
        </>
      }
    >
      <ul className={styles.alertList}>
        {alerts.map((alert) => {
          const { detail } = notificationText(alert)
          const moment = alertMoment(alert.data.minutes_before ?? 0, Boolean(alert.data.all_day))
          return (
            <li key={alert.id} className={styles.alertItem}>
              <strong className={styles.alertTitle}>{alert.reminder_title}</strong>
              <span>{moment}</span>
              {detail && <span className="muted">{detail}</span>}
              {!single && (
                <button type="button" className={`btn btn-ghost btn-sm ${styles.alertOpen}`} onClick={() => onOpen(alert)}>
                  Ver en el calendario
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
