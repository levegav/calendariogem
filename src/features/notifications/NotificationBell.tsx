import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { UserAvatar } from '../../components/UserAvatar'
import { notificationText, timeAgo } from './messages'
import { isSoundEnabled, playChime, setSoundEnabled } from './sound'
import styles from './notifications.module.css'
import { useNotifications } from './NotificationsContext'

/** Campana con el contador de no leídas y la lista de notificaciones recientes. */
export function NotificationBell({ align = 'start' }: { align?: 'start' | 'end' }) {
  const { items, unread, missed, markAllRead, open: openNotification } = useNotifications()
  const [open, setOpen] = useState(false)
  const [sound, setSound] = useState(isSoundEnabled)
  const buttonRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // El panel va en document.body (el menú lateral lo recortaría y lo dejaría
  // debajo del contenido): se cierra al tocar fuera de la campana y del panel.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const label = unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'

  return (
    <div className={styles.bell} ref={buttonRef}>
      <button
        type="button"
        className={`icon-btn ${styles.bellButton}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open &&
        createPortal(
            <div
              ref={panelRef}
              id={panelId}
              className={styles.panel}
              data-align={align}
              role="region"
              aria-label="Notificaciones"
            >
              <header className={styles.panelHeader}>
                <h2>Notificaciones</h2>
                <div className={styles.panelActions}>
                  {unread > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={markAllRead}>
                      Marcar todas como leídas
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-pressed={sound}
                    aria-label="Sonido de notificaciones"
                    title={sound ? 'Sonido activado (tocar para silenciar)' : 'Sonido silenciado (tocar para activar)'}
                    onClick={() => {
                      setSoundEnabled(!sound)
                      setSound(!sound)
                      if (!sound) playChime('aviso', { force: true }) // así suena
                    }}
                  >
                    <Icon name={sound ? 'volume' : 'volumeOff'} size={18} />
                  </button>
                </div>
              </header>

              {items.length === 0 ? (
                <p className={`muted ${styles.empty}`}>No tiene notificaciones.</p>
              ) : (
                <ul className={styles.list}>
                  {items.map((n) => {
                    const { text, detail } = notificationText(n)
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={styles.item}
                          data-unread={!n.read_at}
                          onClick={() => {
                            setOpen(false)
                            openNotification(n)
                          }}
                        >
                          {n.actor ? (
                            <UserAvatar name={n.actor.full_name} color={n.actor.color} size={32} />
                          ) : (
                            <span className={styles.alertIcon} aria-hidden="true">
                              <Icon name="bell" size={16} />
                            </span>
                          )}
                          <span className={styles.itemText}>
                            <span>
                              {missed.has(n.id) && <span className={styles.missed}>Perdido</span>}
                              {text}
                            </span>
                            {detail && <small className="muted">{detail}</small>}
                            <small className={styles.time}>{timeAgo(n.created_at)}</small>
                          </span>
                          {!n.read_at && <span className="sr-only">(sin leer)</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>,
          document.body,
        )}
    </div>
  )
}
