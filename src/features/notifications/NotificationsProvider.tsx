import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { takeUnannounced } from './announced'
import { listNotifications, markNotificationsRead, subscribeToNotifications } from './api'
import { AlertDialog } from './AlertDialog'
import { DecisionDialog } from './DecisionDialog'
import { listPendingDecisions, resolveDecision, type PendingDecision } from './decisions'
import { notificationDate } from './messages'
import { playChime, unlockSound, type ChimeKind } from './sound'
import { NotificationsContext, type NotificationsValue } from './NotificationsContext'
import { Toasts } from './Toasts'
import type { AppNotification } from './types'

/** Respaldo por si se pierde la conexión en tiempo real sin que se note. */
const POLL_MS = 120_000
const APP_TITLE = 'Calendario GEM'

/**
 * Notificaciones del usuario en sesión: las carga, escucha las nuevas en tiempo
 * real y las presenta. Los avisos previos que llegan con la app abierta salen en
 * una ventana; los que llegaron con la app cerrada quedan en la campana como
 * "Perdido". Las demás notificaciones nuevas salen como mensaje breve.
 * Al entrar, si llegó algo mientras la persona no estaba (y este navegador aún
 * no lo había anunciado), suena una sola vez.
 */
export function NotificationsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])
  const [missed, setMissed] = useState<ReadonlySet<number>>(new Set())
  const [version, setVersion] = useState(0)
  const [alerts, setAlerts] = useState<AppNotification[]>([])
  const [toasts, setToasts] = useState<AppNotification[]>([])
  const [decisions, setDecisions] = useState<PendingDecision[]>([])
  /** Decisiones ya vistas; null hasta la primera carga. */
  const knownDecisions = useRef<Set<number> | null>(null)
  /** Ids ya vistos; null hasta la primera carga. */
  const known = useRef<Set<number> | null>(null)
  const requestSeq = useRef(0)
  const appliedSeq = useRef(0)
  /** Al entrar suena una sola vez, aunque haya notificaciones y decisiones pendientes. */
  const entryChimed = useRef(false)

  const chimeOnEntry = useCallback((kind: ChimeKind) => {
    if (entryChimed.current) return
    entryChimed.current = true
    playChime(kind)
  }, [])

  /** Decisiones Conservar / Eliminar pendientes: se presentan una por una. */
  const refreshDecisions = useCallback(async () => {
    let list: PendingDecision[]
    try {
      list = await listPendingDecisions()
    } catch {
      return
    }
    setDecisions(list)
    const seen = knownDecisions.current
    knownDecisions.current = new Set(list.map((d) => d.id))
    const unannounced = takeUnannounced('decisiones', userId, list)
    if (!seen) {
      if (unannounced.length) chimeOnEntry('aviso') // llegaron mientras no estaba
    } else if (list.some((d) => !seen.has(d.id))) {
      playChime('aviso')
      setVersion((v) => v + 1) // el recordatorio pudo desaparecer del calendario
    }
  }, [userId, chimeOnEntry])

  const refresh = useCallback(async () => {
    void refreshDecisions()
    const seq = ++requestSeq.current
    let list: AppNotification[]
    try {
      list = await listNotifications()
    } catch {
      return // se reintenta con la próxima notificación, al volver a la pestaña o en el sondeo
    }
    if (seq < appliedSeq.current) return // llegó después una respuesta más nueva
    appliedSeq.current = seq
    setItems(list)

    const unannounced = takeUnannounced('notificaciones', userId, list)
    if (known.current === null) {
      known.current = new Set(list.map((n) => n.id))
      setMissed(new Set(list.filter((n) => n.kind === 'aviso' && !n.read_at).map((n) => n.id)))
      // Llegaron mientras no estaba: suena una vez (el aviso previo tiene su propio timbre).
      if (unannounced.length) chimeOnEntry(unannounced.some((n) => n.kind === 'aviso') ? 'aviso' : 'notificacion')
      return
    }
    const seen = known.current
    const fresh = list.filter((n) => !seen.has(n.id))
    if (fresh.length === 0) return
    fresh.forEach((n) => seen.add(n.id))
    const unreadFresh = fresh.filter((n) => !n.read_at).reverse() // de la más vieja a la más nueva
    const newAlerts = unreadFresh.filter((n) => n.kind === 'aviso')
    const newOthers = unreadFresh.filter((n) => n.kind !== 'aviso')
    if (newAlerts.length) setAlerts((prev) => [...prev, ...newAlerts])
    if (newOthers.length) setToasts((prev) => [...prev, ...newOthers])
    if (newAlerts.length) playChime('aviso')
    else if (newOthers.length) playChime('notificacion')
    setVersion((v) => v + 1)
  }, [refreshDecisions, userId, chimeOnEntry])

  useEffect(() => {
    // refresh es asíncrona: solo cambia el estado después de recibir la respuesta.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
    const unsubscribe = subscribeToNotifications(
      userId,
      () => void refresh(),
      () => void refresh(),
    )
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [userId, refresh])

  // El navegador solo permite sonido después de un gesto de la persona.
  useEffect(() => {
    const unlock = () => unlockSound()
    document.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  const markRead = useCallback(
    (ids: number[]) => {
      const pending = new Set(ids)
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => (pending.has(n.id) && !n.read_at ? { ...n, read_at: now } : n)))
      markNotificationsRead(ids).catch(() => void refresh())
    },
    [refresh],
  )

  const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id)
  const unread = unreadIds.length

  const open = useCallback(
    (notification: AppNotification) => {
      if (!notification.read_at) markRead([notification.id])
      const date = notificationDate(notification)
      navigate(date ? `/?vista=dia&fecha=${date}` : '/')
    },
    [markRead, navigate],
  )

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ${APP_TITLE}` : APP_TITLE
    return () => {
      document.title = APP_TITLE
    }
  }, [unread])

  const unreadKey = unreadIds.join(',')
  const value: NotificationsValue = useMemo(
    () => ({
      items,
      unread,
      missed,
      version,
      markRead,
      markAllRead: () => markRead(unreadKey ? unreadKey.split(',').map(Number) : []),
      open,
    }),
    [items, unread, missed, version, markRead, unreadKey, open],
  )

  async function resolve(decision: PendingDecision, keep: boolean) {
    await resolveDecision(decision.id, keep)
    setDecisions((prev) => prev.filter((d) => d.id !== decision.id))
    setVersion((v) => v + 1) // recarga el calendario (aparece la copia o se quita el original)
  }

  function acknowledgeAlerts() {
    markRead(alerts.map((n) => n.id))
    setAlerts([])
  }

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {alerts.length > 0 && (
        <AlertDialog
          alerts={alerts}
          onAcknowledge={acknowledgeAlerts}
          onOpen={(n) => {
            acknowledgeAlerts()
            open(n)
          }}
        />
      )}
      {/* Primero los avisos (se cierran con Entendido); después, las decisiones pendientes. */}
      {alerts.length === 0 && decisions.length > 0 && (
        <DecisionDialog
          key={decisions[0].id}
          decision={decisions[0]}
          remaining={decisions.length}
          onResolve={(keep) => resolve(decisions[0], keep)}
        />
      )}
      <Toasts
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((n) => n.id !== id))}
        onOpen={(n) => {
          setToasts((prev) => prev.filter((t) => t.id !== n.id))
          open(n)
        }}
      />
    </NotificationsContext.Provider>
  )
}
