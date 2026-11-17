import { addDays, fromCostaRica, toCostaRica, type DateKey } from '../../lib/dates'
import type { Category } from '../categories/api'
import type { CalendarEvent } from './types'

/** Qué recordatorios mostrar según la relación del usuario con ellos. */
export type Relation = 'todos' | 'creados' | 'etiquetado'

export const RELATION_LABELS: Record<Relation, string> = {
  todos: 'Todos',
  creados: 'Creados por mí',
  etiquetado: 'Donde me etiquetaron',
}

/** Filtros del calendario. No se guardan: al volver a entrar se ve todo. */
export interface CalendarFilters {
  /** Categorías ocultas (por defecto ninguna). */
  hiddenCategories: number[]
  relation: Relation
  /** Ocultar los que ya terminaron. */
  hidePast: boolean
  /** Solo los que tienen ubicación o enlace. */
  withLocation: boolean
}

export const NO_FILTERS: CalendarFilters = { hiddenCategories: [], relation: 'todos', hidePast: false, withLocation: false }

/** Cuántos filtros hay activos (para el contador del botón). */
export function countFilters(filters: CalendarFilters): number {
  return (
    (filters.hiddenCategories.length > 0 ? 1 : 0) +
    (filters.relation !== 'todos' ? 1 : 0) +
    (filters.hidePast ? 1 : 0) +
    (filters.withLocation ? 1 : 0)
  )
}

/** Momento en que termina (los de todo el día, al final de su último día). */
export function eventEndsAt(event: CalendarEvent): Date {
  if (event.all_day) {
    const lastDay: DateKey = toCostaRica(event.end_at ?? event.start_at).date
    return new Date(fromCostaRica(addDays(lastDay, 1)))
  }
  return new Date(event.end_at ?? event.start_at)
}

export function applyFilters(
  events: CalendarEvent[],
  filters: CalendarFilters,
  userId: string,
  now: Date = new Date(),
): CalendarEvent[] {
  if (countFilters(filters) === 0) return events
  const hidden = new Set(filters.hiddenCategories)
  return events.filter((event) => {
    if (hidden.has(event.category.id)) return false
    if (filters.relation === 'creados' && event.owner.id !== userId) return false
    if (filters.relation === 'etiquetado' && !event.participants.some((p) => p.id === userId)) return false
    if (filters.hidePast && eventEndsAt(event) <= now) return false
    if (filters.withLocation && !event.location?.trim()) return false
    return true
  })
}

/** Resumen de los filtros activos: ["Categorías: Reunión, Tarea", "Creados por mí", …]. */
export function describeFilters(filters: CalendarFilters, categories: Category[]): string[] {
  const parts: string[] = []
  if (filters.hiddenCategories.length > 0) {
    const shown = categories.filter((c) => !filters.hiddenCategories.includes(c.id)).map((c) => c.name)
    parts.push(shown.length === 0 ? 'Ninguna categoría' : `Categorías: ${shown.join(', ')}`)
  }
  if (filters.relation !== 'todos') parts.push(RELATION_LABELS[filters.relation])
  if (filters.hidePast) parts.push('Sin los que ya pasaron')
  if (filters.withLocation) parts.push('Con ubicación o enlace')
  return parts
}

export interface DateGroup {
  date: DateKey
  events: CalendarEvent[]
}

/**
 * Resultados de búsqueda agrupados por día (Costa Rica): los próximos (y los
 * que están en curso) de más cercano a más lejano, y los anteriores del más
 * reciente al más viejo.
 */
export function groupResults(events: CalendarEvent[], now: Date = new Date()): { upcoming: DateGroup[]; past: DateGroup[] } {
  const time = (e: CalendarEvent) => new Date(e.start_at).getTime()
  const chronological = [...events].sort((a, b) => time(a) - time(b) || a.id - b.id)
  const group = (list: CalendarEvent[]): DateGroup[] => {
    const groups: DateGroup[] = []
    for (const event of list) {
      const date = toCostaRica(event.start_at).date
      const last = groups[groups.length - 1]
      if (last?.date === date) last.events.push(event)
      else groups.push({ date, events: [event] })
    }
    return groups
  }
  return {
    upcoming: group(chronological.filter((e) => eventEndsAt(e) > now)),
    // Días del más reciente al más viejo; dentro de cada día, en orden de hora.
    past: group(chronological.filter((e) => eventEndsAt(e) <= now)).reverse(),
  }
}
