import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { formatTime, toCostaRica, WEEKDAY_SHORT, weekday, type DateKey } from '../../lib/dates'
import styles from './calendar.module.css'
import { EventChip } from './EventChip'
import { shortTime } from './eventText'
import { eventsOnDay, isBanner, layoutTimedEvents } from './layout'
import type { CalendarEvent } from './types'

/** Alto de una hora en píxeles. */
export const HOUR_HEIGHT = 48
const HOURS = Array.from({ length: 24 }, (_, h) => h)
/** Al hacer clic en la cuadrícula, la hora se redondea a este intervalo. */
const SLOT_MINUTES = 30
/** Hora visible al abrir la vista. */
const SCROLL_TO_HOUR = 7

function useNowMinutes(): { date: DateKey; minutes: number } {
  const [now, setNow] = useState(() => toCostaRica(new Date()))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(toCostaRica(new Date())), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** Vista por horas de uno (Día) o siete días (Semana). */
export function TimeGridView({
  days,
  events,
  today,
  onCreate,
  onOpen,
  onOpenDay,
}: {
  days: DateKey[]
  events: CalendarEvent[]
  today: DateKey
  onCreate: (date: DateKey, minutes?: number) => void
  onOpen: (event: CalendarEvent) => void
  onOpenDay?: (date: DateKey) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useNowMinutes()
  const single = days.length === 1
  const columns = { '--days': days.length } as CSSProperties
  const banners = days.map((day) => eventsOnDay(events, day).filter(isBanner))
  const hasBanners = banners.some((list) => list.length > 0)

  useEffect(() => {
    // Un poco antes de la hora, para que su etiqueta no quede cortada.
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT - 12
  }, [])

  function createAt(day: DateKey, event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = ((event.clientY - rect.top) / HOUR_HEIGHT) * 60
    const minutes = Math.max(0, Math.min(23 * 60 + 30, Math.floor(raw / SLOT_MINUTES) * SLOT_MINUTES))
    onCreate(day, minutes)
  }

  return (
    <div className={styles.timeGrid} data-single={single}>
      <div className={styles.dayHeaders} style={columns}>
        <div className={styles.gutter} />
        {days.map((day) => {
          const label = (
            <>
              <span className={styles.dayHeaderName}>{WEEKDAY_SHORT[weekday(day)]}</span>
              <span className={styles.dayHeaderNumber} data-today={day === today}>
                {Number(day.slice(8))}
              </span>
            </>
          )
          return onOpenDay ? (
            <button key={day} type="button" className={styles.dayHeader} onClick={() => onOpenDay(day)}>
              {label}
            </button>
          ) : (
            <div key={day} className={styles.dayHeader}>
              {label}
            </div>
          )
        })}
      </div>

      {hasBanners && (
        <div className={styles.bannerRow} style={columns}>
          <div className={`${styles.gutter} ${styles.bannerLabel}`}>Todo el día</div>
          {banners.map((list, i) => (
            <div key={days[i]} className={styles.bannerCell}>
              {list.map((event) => (
                <EventChip key={event.id} event={event} onOpen={onOpen} showTime={false} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className={styles.gridScroll} ref={scrollRef}>
        <div className={styles.grid} style={{ ...columns, height: 24 * HOUR_HEIGHT }}>
          <div className={styles.hourLabels}>
            {HOURS.map((hour) => (
              <span key={hour} style={{ top: hour * HOUR_HEIGHT }}>
                {hour === 0 ? '' : formatTime(hour * 60).replace(':00', '')}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day}
              className={styles.dayColumn}
              data-today={day === today}
              onClick={(event) => createAt(day, event)}
              role="presentation"
            >
              {layoutTimedEvents(events, day).map(({ event, start, end, lane, lanes }) => {
                const height = ((end - start) / 60) * HOUR_HEIGHT
                return (
                  <button
                    key={event.id}
                    type="button"
                    className={styles.block}
                    style={
                      {
                        top: (start / 60) * HOUR_HEIGHT,
                        height: height - 2,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        '--owner-color': event.owner.color,
                        '--category-color': event.category.color,
                      } as CSSProperties
                    }
                    title={`${event.title} · ${event.category.name} · Creado por: ${event.owner.full_name}`}
                    aria-label={`${event.title}, ${shortTime(event)}, ${event.category.name}, creado por ${event.owner.full_name}`}
                    onClick={() => onOpen(event)}
                  >
                    <span className={styles.blockTitle}>
                      <span className={styles.chipDot} aria-hidden="true" />
                      {event.title}
                    </span>
                    {height >= 36 && <span className={styles.blockTime}>{shortTime(event)}</span>}
                    {single && height >= 56 && (
                      <span className={styles.blockCreator}>Creado por: {event.owner.full_name}</span>
                    )}
                  </button>
                )
              })}
              {day === now.date && (
                <div className={styles.nowLine} style={{ top: (now.minutes / 60) * HOUR_HEIGHT }} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
