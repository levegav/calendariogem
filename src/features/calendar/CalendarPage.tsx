import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Icon } from '../../components/Icon'
import {
  addDays,
  addMonths,
  addYears,
  formatLongDate,
  formatMonthYear,
  formatWeekRange,
  fromCostaRica,
  isDateKey,
  todayKey,
  weekDays,
  type DateKey,
} from '../../lib/dates'
import { toSpanishMessage } from '../../lib/errors'
import { useAuth } from '../auth/AuthContext'
import { listCategories, type Category } from '../categories/api'
import { deleteReminder, leaveReminder, listCalendarReminders, listPeople, saveReminder } from './api'
import styles from './calendar.module.css'
import { CalendarSelector } from './CalendarSelector'
import { EventDetailsDialog } from './EventDetailsDialog'
import { visibleRange } from './layout'
import { MonthView } from './MonthView'
import { ReminderFormDialog } from './ReminderFormDialog'
import { newReminderValues, valuesFromEvent, type ReminderFormValues } from './reminderForm'
import { TimeGridView } from './TimeGridView'
import { isCalendarView, VIEW_LABELS, VIEWS, type CalendarEvent, type CalendarView, type Person } from './types'
import { YearView } from './YearView'

const VIEW_STORAGE_KEY = 'vista-calendario'

function readSavedView(): CalendarView {
  try {
    const value = localStorage.getItem(VIEW_STORAGE_KEY)
    return isCalendarView(value) ? value : 'mes'
  } catch {
    return 'mes'
  }
}

function saveView(view: CalendarView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view)
  } catch {
    // sin almacenamiento local: solo se pierde la preferencia
  }
}

const VISIBLE_STORAGE_KEY = 'calendarios-visibles'

/** Calendarios elegidos en "Ver calendario de…" (por defecto, solo el propio). */
function readVisible(userId: string): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(`${VISIBLE_STORAGE_KEY}:${userId}`) ?? 'null')
    if (Array.isArray(saved) && saved.length > 0 && saved.every((id) => typeof id === 'string')) return saved
  } catch {
    // valor dañado o sin almacenamiento local
  }
  return userId ? [userId] : []
}

function saveVisible(userId: string, ids: string[]) {
  try {
    localStorage.setItem(`${VISIBLE_STORAGE_KEY}:${userId}`, JSON.stringify(ids))
  } catch {
    // sin almacenamiento local: solo se pierde la preferencia
  }
}

function shift(view: CalendarView, date: DateKey, direction: 1 | -1): DateKey {
  switch (view) {
    case 'dia':
      return addDays(date, direction)
    case 'semana':
      return addDays(date, 7 * direction)
    case 'mes':
      return addMonths(date, direction)
    case 'ano':
      return addYears(date, direction)
  }
}

function title(view: CalendarView, date: DateKey): string {
  switch (view) {
    case 'dia':
      return formatLongDate(date)
    case 'semana':
      return formatWeekRange(date)
    case 'mes':
      return formatMonthYear(date)
    case 'ano':
      return date.slice(0, 4)
  }
}

const PERIOD: Record<CalendarView, { prev: string; next: string }> = {
  dia: { prev: 'Día anterior', next: 'Día siguiente' },
  semana: { prev: 'Semana anterior', next: 'Semana siguiente' },
  mes: { prev: 'Mes anterior', next: 'Mes siguiente' },
  ano: { prev: 'Año anterior', next: 'Año siguiente' },
}

type Dialog =
  | { type: 'create'; values: ReminderFormValues }
  | { type: 'details'; event: CalendarEvent }
  | { type: 'edit'; event: CalendarEvent }
  | null

export function CalendarPage() {
  const { state } = useAuth()
  const profile = state.status === 'signedIn' ? state.profile : null
  const userId = profile?.id ?? ''
  const me: Person = useMemo(
    () => ({ id: userId, full_name: profile?.full_name ?? '', color: profile?.color ?? '#64748b' }),
    [userId, profile?.full_name, profile?.color],
  )
  const [params, setParams] = useSearchParams()
  const today = todayKey()

  // La vista y la fecha viven en la dirección (?vista=semana&fecha=2026-11-16): se pueden guardar o compartir.
  const view: CalendarView = isCalendarView(params.get('vista')) ? (params.get('vista') as CalendarView) : readSavedView()
  const date: DateKey = isDateKey(params.get('fecha')) ? params.get('fecha')! : today

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [savedVisible, setSavedVisible] = useState<string[]>(() => readVisible(userId))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const range = useMemo(() => visibleRange(view, date), [view, date])

  // Solo calendarios de usuarios activos; el propio siempre se puede elegir.
  const visibleIds = useMemo(() => {
    const valid = savedVisible.filter((id) => id === userId || people.length === 0 || people.some((p) => p.id === id))
    return valid.length > 0 ? valid : [userId]
  }, [savedVisible, people, userId])
  const visibleKey = visibleIds.join(',')

  function changeVisible(ids: string[]) {
    setSavedVisible(ids)
    saveVisible(userId, ids)
  }

  const go = useCallback(
    (nextView: CalendarView, nextDate: DateKey) => {
      saveView(nextView)
      setParams({ vista: nextView, fecha: nextDate })
    },
    [setParams],
  )

  useEffect(() => {
    let cancelled = false
    listCategories().then(
      (data) => !cancelled && setCategories(data),
      (err) => !cancelled && setError(toSpanishMessage(err)),
    )
    listPeople().then(
      (data) => !cancelled && setPeople(data),
      (err) => !cancelled && setError(toSpanishMessage(err)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    listCalendarReminders(visibleKey.split(','), fromCostaRica(range.from), fromCostaRica(range.to)).then(
      (data) => {
        if (cancelled) return
        setEvents(data)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (cancelled) return
        setError(toSpanishMessage(err))
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, visibleKey, range.from, range.to, reloadKey])

  const reload = () => setReloadKey((key) => key + 1)
  const activeCategories = categories.filter((c) => c.active)
  const taggable = people.filter((p) => p.id !== userId)
  const showingOnlyMine = visibleIds.length === 1 && visibleIds[0] === userId

  function openCreate(day?: DateKey, minutes?: number) {
    setNotice(null)
    setDialog({
      type: 'create',
      values: newReminderValues({ date: day ?? (date === today ? today : date), minutes, categoryId: activeCategories[0]?.id }),
    })
  }

  const openDay = (day: DateKey) => go('dia', day)
  const openEvent = (event: CalendarEvent) => setDialog({ type: 'details', event })

  return (
    <section className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.navigation}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(view, today)}>
            Hoy
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={PERIOD[view].prev}
            title={PERIOD[view].prev}
            onClick={() => go(view, shift(view, date, -1))}
          >
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={PERIOD[view].next}
            title={PERIOD[view].next}
            onClick={() => go(view, shift(view, date, 1))}
          >
            <Icon name="chevronRight" />
          </button>
          <h1 className={styles.title} aria-live="polite">
            {title(view, date)}
          </h1>
        </div>

        <div className={styles.toolbarEnd}>
          {userId && <CalendarSelector me={me} people={people} selected={visibleIds} onChange={changeVisible} />}
          <fieldset className={`segmented ${styles.views}`}>
            <legend className="sr-only">Vista</legend>
            {VIEWS.map((option) => (
              <label key={option} className={view === option ? 'is-selected' : undefined}>
                <input type="radio" name="vista" checked={view === option} onChange={() => go(option, date)} />
                {VIEW_LABELS[option]}
              </label>
            ))}
          </fieldset>
          <button type="button" className={`btn btn-primary ${styles.newButton}`} onClick={() => openCreate()}>
            <Icon name="plus" size={18} />
            Nuevo recordatorio
          </button>
        </div>
      </div>

      {notice && (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <div className={styles.viewArea} aria-busy={loading}>
        {view === 'dia' && (
          <TimeGridView days={[date]} events={events} today={today} onCreate={openCreate} onOpen={openEvent} />
        )}
        {view === 'semana' && (
          <TimeGridView
            days={weekDays(date)}
            events={events}
            today={today}
            onCreate={openCreate}
            onOpen={openEvent}
            onOpenDay={openDay}
          />
        )}
        {view === 'mes' && (
          <MonthView date={date} events={events} today={today} onCreate={(d) => openCreate(d)} onOpen={openEvent} onOpenDay={openDay} />
        )}
        {view === 'ano' && (
          <YearView date={date} events={events} today={today} onOpenDay={openDay} onOpenMonth={(m) => go('mes', m)} />
        )}
      </div>

      {/* Botón flotante en celular */}
      <button type="button" className={styles.fab} aria-label="Nuevo recordatorio" onClick={() => openCreate()}>
        <Icon name="plus" size={26} />
      </button>

      {dialog?.type === 'create' && (
        <ReminderFormDialog
          mode="create"
          initialValues={dialog.values}
          categories={activeCategories}
          people={taggable}
          onClose={() => setDialog(null)}
          onSave={async (payload) => {
            await saveReminder(null, payload)
            setDialog(null)
            setNotice(`Recordatorio "${payload.title}" creado.`)
            reload()
          }}
        />
      )}

      {dialog?.type === 'details' && (
        <EventDetailsDialog
          event={dialog.event}
          currentUserId={userId}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ type: 'edit', event: dialog.event })}
          onDelete={async () => {
            await deleteReminder(dialog.event.id)
            setDialog(null)
            setNotice(`Recordatorio "${dialog.event.title}" eliminado.`)
            reload()
          }}
          onLeave={async () => {
            await leaveReminder(dialog.event.id, userId)
            setDialog(null)
            setNotice(`Salió del recordatorio "${dialog.event.title}".`)
            reload()
          }}
        />
      )}

      {dialog?.type === 'edit' && (
        <ReminderFormDialog
          mode="edit"
          initialValues={valuesFromEvent(dialog.event)}
          categories={
            dialog.event.category.active
              ? activeCategories
              : [...activeCategories, { ...dialog.event.category }]
          }
          people={[
            ...taggable,
            // Etiquetados que ya no están activos se conservan mientras no se quiten.
            ...dialog.event.participants.filter((p) => !taggable.some((t) => t.id === p.id)),
          ]}
          onClose={() => setDialog({ type: 'details', event: dialog.event })}
          onSave={async (payload) => {
            await saveReminder(dialog.event.id, payload)
            setDialog(null)
            setNotice(`Recordatorio "${payload.title}" actualizado.`)
            reload()
          }}
        />
      )}

      {!loading && events.length === 0 && !error && (
        <p className={`muted ${styles.empty}`}>
          {showingOnlyMine
            ? 'No tiene recordatorios en este período.'
            : 'No hay recordatorios de los calendarios elegidos en este período.'}{' '}
          Use <strong>Nuevo recordatorio</strong> o toque un día para crear uno.
        </p>
      )}
    </section>
  )
}
