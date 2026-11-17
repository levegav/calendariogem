import { createContext, useContext } from 'react'
import type { AppNotification } from './types'

export interface NotificationsValue {
  /** Notificaciones recientes, de la más nueva a la más vieja. */
  items: AppNotification[]
  unread: number
  /** Avisos previos que llegaron con la app cerrada (se marcan "Perdido"). */
  missed: ReadonlySet<number>
  /** Aumenta cada vez que llega algo nuevo (p. ej. para recargar el calendario). */
  version: number
  markRead: (ids: number[]) => void
  markAllRead: () => void
  /** Lleva al día del recordatorio en el calendario. */
  open: (notification: AppNotification) => void
}

const noop = () => {}

export const NotificationsContext = createContext<NotificationsValue>({
  items: [],
  unread: 0,
  missed: new Set(),
  version: 0,
  markRead: noop,
  markAllRead: noop,
  open: noop,
})

export function useNotifications(): NotificationsValue {
  return useContext(NotificationsContext)
}
