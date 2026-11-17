import { describe, expect, it } from 'vitest'
import { applyFilters, countFilters, describeFilters, eventEndsAt, groupResults, NO_FILTERS } from './filters'
import { fakeEvent } from './testEvents'

const yo = { id: 'yo', full_name: 'Luis Vega', color: '#2563eb' }
const carlos = { id: 'carlos', full_name: 'Carlos Mora', color: '#16a34a' }
const reunion = { id: 1, name: 'Reunión', color: '#2563eb', active: true }
const tarea = { id: 2, name: 'Tarea', color: '#16a34a', active: true }
const now = new Date('2026-11-17T16:00:00Z') // 10:00 a. m. en Costa Rica

const mio = fakeEvent({ id: 1, title: 'Mío', start_at: '2026-11-18T09:00:00-06:00', owner: yo, category: reunion, location: 'Sala 2' })
const etiquetado = fakeEvent({ id: 2, title: 'Etiquetado', start_at: '2026-11-16T09:00:00-06:00', owner: carlos, participants: [yo], category: tarea })
const ajeno = fakeEvent({ id: 3, title: 'Ajeno', start_at: '2026-11-19T09:00:00-06:00', owner: carlos, category: tarea, location: '  ' })
const todos = [mio, etiquetado, ajeno]
const titles = (list: { title: string }[]) => list.map((e) => e.title)

describe('applyFilters', () => {
  it('sin filtros devuelve todo', () => {
    expect(applyFilters(todos, NO_FILTERS, 'yo', now)).toBe(todos)
    expect(countFilters(NO_FILTERS)).toBe(0)
  })

  it('por categoría, relación, pasados y ubicación', () => {
    expect(titles(applyFilters(todos, { ...NO_FILTERS, hiddenCategories: [2] }, 'yo', now))).toEqual(['Mío'])
    expect(titles(applyFilters(todos, { ...NO_FILTERS, relation: 'creados' }, 'yo', now))).toEqual(['Mío'])
    expect(titles(applyFilters(todos, { ...NO_FILTERS, relation: 'etiquetado' }, 'yo', now))).toEqual(['Etiquetado'])
    expect(titles(applyFilters(todos, { ...NO_FILTERS, hidePast: true }, 'yo', now))).toEqual(['Mío', 'Ajeno'])
    expect(titles(applyFilters(todos, { ...NO_FILTERS, withLocation: true }, 'yo', now))).toEqual(['Mío'])
  })

  it('los filtros se combinan', () => {
    const filters = { hiddenCategories: [1], relation: 'todos' as const, hidePast: true, withLocation: false }
    expect(titles(applyFilters(todos, filters, 'yo', now))).toEqual(['Ajeno'])
    expect(countFilters(filters)).toBe(2)
  })

  it('uno de todo el día de hoy todavía no pasó', () => {
    const hoy = fakeEvent({ start_at: '2026-11-17T00:00:00-06:00', all_day: true })
    expect(eventEndsAt(hoy).toISOString()).toBe('2026-11-18T06:00:00.000Z')
    expect(applyFilters([hoy], { ...NO_FILTERS, hidePast: true }, 'yo', now)).toHaveLength(1)
  })
})

describe('describeFilters', () => {
  it('resume los filtros activos', () => {
    expect(describeFilters({ hiddenCategories: [2], relation: 'creados', hidePast: true, withLocation: true }, [reunion, tarea])).toEqual([
      'Categorías: Reunión',
      'Creados por mí',
      'Sin los que ya pasaron',
      'Con ubicación o enlace',
    ])
    expect(describeFilters({ ...NO_FILTERS, hiddenCategories: [1, 2] }, [reunion, tarea])).toEqual(['Ninguna categoría'])
  })
})

describe('groupResults', () => {
  it('separa próximos y anteriores, agrupados por día', () => {
    const tarde = fakeEvent({ id: 4, title: 'Mío tarde', start_at: '2026-11-18T15:00:00-06:00' })
    const viejo = fakeEvent({ id: 5, title: 'Viejo', start_at: '2026-10-01T09:00:00-06:00' })
    const { upcoming, past } = groupResults([ajeno, tarde, viejo, mio, etiquetado], now)
    expect(upcoming.map((g) => [g.date, titles(g.events)])).toEqual([
      ['2026-11-18', ['Mío', 'Mío tarde']],
      ['2026-11-19', ['Ajeno']],
    ])
    expect(past.map((g) => [g.date, titles(g.events)])).toEqual([
      ['2026-11-16', ['Etiquetado']],
      ['2026-10-01', ['Viejo']],
    ])
  })
})
