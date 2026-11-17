import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { notificationText } from './messages'
import styles from './notifications.module.css'
import type { AppNotification } from './types'

/** Tiempo que se muestra cada mensaje breve. */
const TOAST_MS = 8000

function Toast({
  notification,
  onDismiss,
  onOpen,
}: {
  notification: AppNotification
  onDismiss: (id: number) => void
  onOpen: (notification: AppNotification) => void
}) {
  // El temporizador no se reinicia aunque cambien las funciones en cada render.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })
  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(notification.id), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [notification.id])

  const { text, detail } = notificationText(notification)
  return (
    <li className={styles.toast} style={{ borderLeftColor: notification.actor?.color }}>
      <button type="button" className={styles.toastBody} onClick={() => onOpen(notification)}>
        <span>{text}</span>
        {detail && <small className="muted">{detail}</small>}
      </button>
      <button type="button" className="icon-btn" aria-label="Cerrar mensaje" onClick={() => onDismiss(notification.id)}>
        <Icon name="close" size={16} />
      </button>
    </li>
  )
}

/** Mensajes breves de las notificaciones nuevas (menos los avisos previos, que usan ventana). */
export function Toasts({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: AppNotification[]
  onDismiss: (id: number) => void
  onOpen: (notification: AppNotification) => void
}) {
  return createPortal(
    <ul className={styles.toasts} role="status" aria-live="polite" aria-label="Notificaciones nuevas">
      {toasts.slice(-3).map((n) => (
        <Toast key={n.id} notification={n} onDismiss={onDismiss} onOpen={onOpen} />
      ))}
    </ul>,
    document.body,
  )
}
