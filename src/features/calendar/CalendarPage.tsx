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
  toCostaRica,
  todayKey,
  weekDays,
  type DateKey,
} from '../../lib/dates'
import { toSpanishMessage } from '../../lib/errors'
import { useAuth } from '../auth/AuthContext'
import { listCategories, type Category } from '../categories/api'
import { useNotifications } from '../notifications/NotificationsContext'
import {
  deleteReminder,
  leaveReminder,
  listCalendarReminders,
  listPeople,
  saveReminder,
  searchReminders,
  setMyAlerts,
} from './api'
import styles from './calendar.module.css'
import { CalendarSelector } from './CalendarSelector'
import { EventDetailsDialog } from './EventDetailsDialog'
import { applyFilters, countFilters, describeFilters, NO_FILTERS, type CalendarFilters } from './filters'
import { FiltersMenu } from './FiltersMenu'
import { visibleRange } from './layout'
import { MonthView } from './MonthView'
import { ReminderFormDialog } from './ReminderFormDialog'
import { SearchResults } from './SearchResults'
import {
  listOutlookEvents,
  OUTLOOK_CATEGORY,
  OUTLOOK_SEARCH_LIMIT,
  searchOutlookEvents,
  subscribeToOutlookChanges,
} from './outlook'
import { OutlookDetailsDialog } from './OutlookDetailsDialog'
import { newReminderValues, valuesFromEvent, type ReminderFormValues } from './reminderForm'
import { TimeGridView } from './TimeGridView'
import { isCalendarView, VIEW_LABELS, VIEWS, type CalendarEvent, type CalendarView, type Person } from './types'
import { YearView } from './YearView'

const VIEW_STORAGE_KEY = 'vista-calendario'
/** Se busca al dejar de escribir por este tiempo, y desde esta cantidad de letras. */
const SEARCH_DELAY_MS = 300
const MIN_SEARCH_LENGTH = 2
/** Si llegan varios cambios de Outlook seguidos, se recarga una sola vez. */
const OUTLOOK_RELOAD_DELAY_MS = 800

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
  // Al llegar una notificación (etiquetado, cambios…) se recarga el calendario.
  const { version: notificationsVersion } = useNotifications()
  // Solo el admin puede ver los calendarios de otros (el servidor lo impone con RLS).
  const canViewOthers = profile?.role === 'admin'
  // Con acceso al calendario general, lo suyo y lo del general se ven siempre juntos
  // (el servidor los incluye) y al guardar se elige dónde publicar.
  const canPublishGeneral = profile?.general_access === true
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
  /** Última consulta del calendario ya respondida; mientras no sea la actual, se está cargando. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Filtros (no se guardan: al volver a entrar se ve todo).
  const [filters, setFilters] = useState<CalendarFilters>(NO_FILTERS)
  // Búsqueda en todas las fechas; se consulta al dejar de escribir.
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ key: string; query: string; results: CalendarEvent[]; truncated: boolean } | null>(
    null,
  )

  const range = useMemo(() => visibleRange(view, date), [view, date])

  // Solo calendarios de usuarios activos; el propio siempre se puede elegir.
  const visibleIds = useMemo(() => {
    if (!canViewOthers) return [userId]
    const valid = savedVisible.filter((id) => id === userId || people.length === 0 || people.some((p) => p.id === id))
    return valid.length > 0 ? valid : [userId]
  }, [canViewOthers, savedVisible, people, userId])
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

  const requestKey = [userId, visibleKey, range.from, range.to, reloadKey, notificationsVersion].join('|')
  const loading = loadedKey !== requestKey
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const ids = visibleKey.split(',')
    const from = fromCostaRica(range.from)
    const to = fromCostaRica(range.to)
    Promise.all([
      listCalendarReminders(ids, from, to),
      // Si fallan las reuniones de Outlook, los recordatorios se muestran igual.
      listOutlookEvents(ids, from, to).catch(() => []),
    ]).then(
      ([reminders, meetings]) => {
        if (cancelled) return
        setEvents([...reminders, ...meetings])
        setError(null)
        setLoadedKey(requestKey)
      },
      (err) => {
        if (cancelled) return
        setError(toSpanishMessage(err))
        setLoadedKey(requestKey)
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, visibleKey, range.from, range.to, requestKey])

  // Reuniones de Outlook: cuando llegan cambios de un calendario que se está
  // viendo, se recarga sola (sin refrescar la página).
  useEffect(() => {
    if (!userId) return
    const visible = new Set(visibleKey.split(','))
    let timer: number | undefined
    const unsubscribe = subscribeToOutlookChanges((changedUserId) => {
      if (changedUserId && !visible.has(changedUserId)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setReloadKey((key) => key + 1), OUTLOOK_RELOAD_DELAY_MS)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [userId, visibleKey])

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchText.trim()), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [searchText])

  const searchActive = query.length >= MIN_SEARCH_LENGTH
  const searchKey = [query, visibleKey, reloadKey, notificationsVersion].join('|')
  const searching = searchActive && search?.key !== searchKey
  useEffect(() => {
    if (!userId || query.length < MIN_SEARCH_LENGTH) return
    let cancelled = false
    const ids = visibleKey.split(',')
    Promise.all([searchReminders(ids, query), searchOutlookEvents(ids, query, OUTLOOK_SEARCH_LIMIT + 1).catch(() => [])]).then(
      ([{ results, truncated }, meetings]) => {
        if (cancelled) return
        setSearch({
          key: searchKey,
          query,
          results: [...results, ...meetings.slice(0, OUTLOOK_SEARCH_LIMIT)],
          truncated: truncated || meetings.length > OUTLOOK_SEARCH_LIMIT,
        })
        setError(null)
      },
      (err) => {
        if (cancelled) return
        setError(toSpanishMessage(err))
        setSearch({ key: searchKey, query, results: [], truncated: false })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, query, visibleKey, searchKey])

  function clearSearch() {
    setSearchText('')
    setQuery('')
    setSearch(null)
  }

  /** Un resultado abre su día y sus detalles. */
  function openResult(event: CalendarEvent) {
    clearSearch()
    go('dia', toCostaRica(event.start_at).date)
    setDialog({ type: 'details', event })
  }

  const reload = () => setReloadKey((key) => key + 1)
  const shownEvents = useMemo(() => applyFilters(events, filters, userId), [events, filters, userId])
  const filterCount = countFilters(filters)
  const hiddenByFilters = events.length - shownEvents.length
  const searchResults = search ? applyFilters(search.results, filters, userId) : []
  const activeCategories = categories.filter((c) => c.active)
  // "Reunión de Outlook" aparece en los filtros cuando hay reuniones (o está oculta).
  const hasOutlook = events.some((e) => e.outlook) || filters.hiddenCategories.includes(OUTLOOK_CATEGORY.id)
  const filterCategories = hasOutlook ? [...categories, OUTLOOK_CATEGORY] : categories
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
          <label className={styles.search}>
            <Icon name="search" size={16} />
            <span className="sr-only">Buscar recordatorios</span>
            <input
              type="search"
              value={searchText}
              placeholder="Buscar recordatorios"
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') clearSearch()
              }}
            />
          </label>
          <FiltersMenu categories={filterCategories} filters={filters} onChange={setFilters} />
          {userId && canViewOthers && <CalendarSelector me={me} people={people} selected={visibleIds} onChange={changeVisible} />}
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

      {filterCount > 0 && (
        <p className={styles.filterBanner} role="status">
          <span>
            <strong>Filtros:</strong> {describeFilters(filters, filterCategories).join(' · ')}
            {!searchActive && hiddenByFilters > 0 && (
              <> ({hiddenByFilters === 1 ? '1 recordatorio oculto' : `${hiddenByFilters} recordatorios ocultos`})</>
            )}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilters(NO_FILTERS)}>
            Quitar filtros
          </button>
        </p>
      )}

      {searchActive ? (
        <SearchResults
          query={query}
          results={search?.query === query ? searchResults : []}
          loading={searching}
          truncated={search?.query === query && search.truncated}
          filtered={search?.query === query ? search.results.length - searchResults.length : 0}
          onOpen={openResult}
          onClear={clearSearch}
        />
      ) : (
        <div className={styles.viewArea} aria-busy={loading}>
          {view === 'dia' && (
            <TimeGridView days={[date]} events={shownEvents} today={today} onCreate={openCreate} onOpen={openEvent} />
          )}
          {view === 'semana' && (
            <TimeGridView
              days={weekDays(date)}
              events={shownEvents}
              today={today}
              onCreate={openCreate}
              onOpen={openEvent}
              onOpenDay={openDay}
            />
          )}
          {view === 'mes' && (
            <MonthView date={date} events={shownEvents} today={today} onCreate={(d) => openCreate(d)} onOpen={openEvent} onOpenDay={openDay} />
          )}
          {view === 'ano' && (
            <YearView date={date} events={shownEvents} today={today} onOpenDay={openDay} onOpenMonth={(m) => go('mes', m)} />
          )}
        </div>
      )}

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
          canPublishGeneral={canPublishGeneral}
          onClose={() => setDialog(null)}
          onSave={async (payload) => {
            await saveReminder(null, payload)
            setDialog(null)
            setNotice(
              payload.is_general
                ? `Recordatorio "${payload.title}" publicado en el calendario general.`
                : `Recordatorio "${payload.title}" creado.`,
            )
            reload()
          }}
        />
      )}

      {dialog?.type === 'details' && dialog.event.outlook && (
        <OutlookDetailsDialog event={dialog.event} currentUserId={userId} onClose={() => setDialog(null)} />
      )}

      {dialog?.type === 'details' && !dialog.event.outlook && (
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
          onAlertsChange={async (minutes) => {
            await setMyAlerts(dialog.event.id, minutes)
            const updated = { ...dialog.event, my_alerts: minutes }
            setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
            setDialog({ type: 'details', event: updated })
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
          canPublishGeneral={canPublishGeneral}
          onClose={() => setDialog({ type: 'details', event: dialog.event })}
          onSave={async (payload) => {
            await saveReminder(dialog.event.id, payload)
            setDialog(null)
            setNotice(`Recordatorio "${payload.title}" actualizado.`)
            reload()
          }}
        />
      )}

      {!searchActive && !loading && !error && events.length > 0 && shownEvents.length === 0 && (
        <p className={`muted ${styles.empty}`}>Los filtros ocultan todos los recordatorios de este período.</p>
      )}

      {!searchActive && !loading && events.length === 0 && !error && (
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
