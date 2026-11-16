import { describe, expect, it } from 'vitest'
import { eventSpan, eventsOnDay, isBanner, layoutTimedEvents, occursOn, visibleRange } from './layout'
import { fakeEvent } from './testEvents'

describe('eventSpan', () => {
  it('usa la hora de Costa Rica', () => {
    const event = fakeEvent({ start_at: '2026-11-16T14:00:00-06:00', end_at: '2026-11-16T15:30:00-06:00' })
    expect(eventSpan(event)).toEqual({ startDate: '2026-11-16', startMinutes: 840, endDate: '2026-11-16', endMinutes: 930 })
  })

  it('sin hora de fin dura 30 minutos en pantalla', () => {
    expect(eventSpan(fakeEvent({ start_at: '2026-11-16T09:00:00-06:00' })).endMinutes).toBe(570)
  })

  it('un evento que termina a medianoche pertenece al día anterior', () => {
    const event = fakeEvent({ start_at: '2026-11-16T22:00:00-06:00', end_at: '2026-11-17T00:00:00-06:00' })
    expect(eventSpan(event)).toMatchObject({ endDate: '2026-11-16', endMinutes: 1440 })
    expect(isBanner(event)).toBe(false)
  })

  it('todo el día abarca los días completos, inclusive el último', () => {
    const event = fakeEvent({ start_at: '2026-11-16T00:00:00-06:00', end_at: '2026-11-18T00:00:00-06:00', all_day: true })
    expect(eventSpan(event)).toMatchObject({ startDate: '2026-11-16', endDate: '2026-11-18' })
    expect(occursOn(event, '2026-11-17')).toBe(true)
    expect(occursOn(event, '2026-11-19')).toBe(false)
  })

  it('un evento con hora que cruza varios días va en la franja superior', () => {
    const event = fakeEvent({ start_at: '2026-11-16T20:00:00-06:00', end_at: '2026-11-17T08:00:00-06:00' })
    expect(isBanner(event)).toBe(true)
    expect(occursOn(event, '2026-11-17')).toBe(true)
  })
})

describe('eventsOnDay', () => {
  it('ordena: primero todo el día, luego por hora', () => {
    const late = fakeEvent({ title: 'Tarde', start_at: '2026-11-16T15:00:00-06:00' })
    const early = fakeEvent({ title: 'Temprano', start_at: '2026-11-16T08:00:00-06:00' })
    const allDay = fakeEvent({ title: 'Feriado', start_at: '2026-11-16T00:00:00-06:00', all_day: true })
    expect(eventsOnDay([late, early, allDay], '2026-11-16').map((e) => e.title)).toEqual(['Feriado', 'Temprano', 'Tarde'])
  })
})

describe('layoutTimedEvents', () => {
  const at = (title: string, start: string, end: string) =>
    fakeEvent({ title, start_at: `2026-11-16T${start}:00-06:00`, end_at: `2026-11-16T${end}:00-06:00` })

  it('los que no se cruzan ocupan todo el ancho', () => {
    const blocks = layoutTimedEvents([at('A', '09:00', '10:00'), at('B', '10:00', '11:00')], '2026-11-16')
    expect(blocks.map((b) => [b.event.title, b.lane, b.lanes])).toEqual([
      ['A', 0, 1],
      ['B', 0, 1],
    ])
  })

  it('los que se cruzan se reparten en columnas', () => {
    const blocks = layoutTimedEvents(
      [at('A', '09:00', '11:00'), at('B', '09:30', '10:00'), at('C', '10:00', '10:30'), at('D', '12:00', '13:00')],
      '2026-11-16',
    )
    const byTitle = Object.fromEntries(blocks.map((b) => [b.event.title, [b.lane, b.lanes]]))
    expect(byTitle).toEqual({ A: [0, 2], B: [1, 2], C: [1, 2], D: [0, 1] })
  })

  it('excluye los de todo el día', () => {
    const allDay = fakeEvent({ start_at: '2026-11-16T00:00:00-06:00', all_day: true })
    expect(layoutTimedEvents([allDay], '2026-11-16')).toEqual([])
  })

  it('los bloques muy cortos tienen una altura mínima', () => {
    const [block] = layoutTimedEvents([at('Corto', '09:00', '09:05')], '2026-11-16')
    expect(block.end - block.start).toBe(20)
  })
})

describe('visibleRange', () => {
  it('calcula el rango de cada vista', () => {
    expect(visibleRange('dia', '2026-11-18')).toEqual({ from: '2026-11-18', to: '2026-11-19' })
    expect(visibleRange('semana', '2026-11-18')).toEqual({ from: '2026-11-16', to: '2026-11-23' })
    expect(visibleRange('mes', '2026-11-18')).toEqual({ from: '2026-10-26', to: '2026-12-07' })
    expect(visibleRange('ano', '2026-11-18')).toEqual({ from: '2026-01-01', to: '2027-01-01' })
  })
})
