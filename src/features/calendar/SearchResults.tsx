import { formatLongDate, todayKey } from '../../lib/dates'
import styles from './calendar.module.css'
import { shortTime } from './eventText'
import { groupResults, type DateGroup } from './filters'
import { eventKind, eventStyle, GENERAL_NAME } from './general'
import type { CalendarEvent } from './types'

function Group({ group, today, onOpen }: { group: DateGroup; today: string; onOpen: (event: CalendarEvent) => void }) {
  return (
    <li>
      <h3 className={styles.resultsDate}>
        {formatLongDate(group.date)}
        {group.date === today && <span className={styles.resultsToday}>Hoy</span>}
      </h3>
      <ul className={styles.resultsList}>
        {group.events.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              className={styles.result}
              style={eventStyle(event)}
              {...eventKind(event)}
              onClick={() => onOpen(event)}
            >
              <span className={styles.resultTime}>{shortTime(event)}</span>
              <span className={styles.resultText}>
                <strong>{event.title}</strong>
                <small className="muted">
                  <span className={styles.chipDot} aria-hidden="true" /> {event.category.name} ·{' '}
                  {event.is_general && <>{GENERAL_NAME} · </>}
                  {event.outlook ? 'Calendario de' : 'Creado por'}: {event.owner.full_name}
                  {event.location ? ` · ${event.location}` : ''}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  )
}

/** Resultados de búsqueda en todas las fechas: próximos y anteriores, por día. */
export function SearchResults({
  query,
  results,
  loading,
  truncated,
  filtered,
  onOpen,
  onClear,
}: {
  query: string
  results: CalendarEvent[]
  loading: boolean
  /** Hubo más coincidencias de las que se muestran. */
  truncated: boolean
  /** Cuántos resultados ocultan los filtros activos. */
  filtered: number
  onOpen: (event: CalendarEvent) => void
  onClear: () => void
}) {
  const { upcoming, past } = groupResults(results)
  const today = todayKey()

  return (
    <section className={styles.results} aria-busy={loading} aria-label="Resultados de la búsqueda">
      <header className={styles.resultsHeader}>
        <h2>
          {loading && results.length === 0
            ? 'Buscando…'
            : results.length === 0
              ? `Sin resultados para «${query}»`
              : `${results.length === 1 ? '1 resultado' : `${results.length} resultados`} para «${query}»`}
        </h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
          Volver al calendario
        </button>
      </header>

      {filtered > 0 && (
        <p className="muted">
          {filtered === 1 ? 'Los filtros ocultan 1 resultado más.' : `Los filtros ocultan ${filtered} resultados más.`}
        </p>
      )}

      {!loading && results.length === 0 && (
        <p className={`muted ${styles.resultsEmpty}`}>
          No se encontraron recordatorios. Pruebe con otra palabra; se busca en el título, la descripción, la ubicación y la nota.
        </p>
      )}

      {upcoming.length > 0 && (
        <>
          <h3 className={styles.resultsSection}>Próximos</h3>
          <ul className={styles.resultsGroups}>
            {upcoming.map((group) => (
              <Group key={group.date} group={group} today={today} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h3 className={styles.resultsSection}>Anteriores</h3>
          <ul className={styles.resultsGroups}>
            {past.map((group) => (
              <Group key={group.date} group={group} today={today} onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}

      {truncated && <p className="muted">Se muestran los más cercanos a hoy. Escriba más palabras para afinar la búsqueda.</p>}
    </section>
  )
}
