import { describe, expect, it } from 'vitest'
import { asLink, newReminderValues, toPayload, validateReminder, valuesFromEvent } from './reminderForm'
import { fakeEvent } from './testEvents'

// 10:20 a. m. del 16 de noviembre en Costa Rica.
const now = new Date('2026-11-16T16:20:00Z')

describe('newReminderValues', () => {
  it('hoy propone la próxima hora en punto', () => {
    expect(newReminderValues({}, now)).toMatchObject({ startDate: '2026-11-16', startTime: 11 * 60, endTime: 12 * 60 })
  })

  it('otro día propone las 9:00 a. m.', () => {
    expect(newReminderValues({ date: '2026-11-20' }, now)).toMatchObject({ startDate: '2026-11-20', startTime: 9 * 60 })
  })

  it('usa la hora de la casilla elegida', () => {
    expect(newReminderValues({ date: '2026-11-20', minutes: 14 * 60 + 30 }, now).startTime).toBe(870)
  })
})

describe('validateReminder', () => {
  const base = { ...newReminderValues({ date: '2026-11-20', minutes: 600 }, now), title: 'Reunión', categoryId: 1 }

  it('exige título y categoría', () => {
    expect(validateReminder({ ...base, title: '  ', categoryId: null })).toEqual({
      title: 'Escriba un título.',
      categoryId: 'Elija una categoría.',
    })
  })

  it('la finalización no puede ser anterior al inicio', () => {
    expect(validateReminder({ ...base, hasEnd: true, endTime: 540 }).end).toBe('La finalización no puede ser anterior al inicio.')
    expect(validateReminder({ ...base, hasEnd: true, endTime: 660 })).toEqual({})
  })

  it('todo el día compara solo las fechas', () => {
    const allDay = { ...base, allDay: true, hasEnd: true }
    expect(validateReminder({ ...allDay, endDate: '2026-11-19' }).end).toMatch(/fecha de finalización/)
    expect(validateReminder({ ...allDay, endDate: '2026-11-20' })).toEqual({})
  })
})

describe('toPayload', () => {
  it('convierte la hora de Costa Rica a UTC y limpia los textos opcionales', () => {
    const values = {
      ...newReminderValues({ date: '2026-11-20', minutes: 14 * 60 }, now),
      title: '  Reunión  ',
      categoryId: 3,
      hasEnd: true,
      endTime: 15 * 60 + 30,
      description: '  ',
      location: ' Sala 2 ',
      participantIds: ['u2', 'u1', 'u2'],
      alerts: [60, 15, 60],
    }
    expect(toPayload(values)).toEqual({
      title: 'Reunión',
      description: null,
      start_at: '2026-11-20T20:00:00.000Z',
      end_at: '2026-11-20T21:30:00.000Z',
      all_day: false,
      category_id: 3,
      location: 'Sala 2',
      note: null,
      participant_ids: ['u2', 'u1'],
      alerts: [15, 60],
    })
  })

  it('todo el día guarda la medianoche de Costa Rica', () => {
    const values = { ...newReminderValues({ date: '2026-11-20' }, now), title: 'Feriado', categoryId: 5, allDay: true }
    expect(toPayload(values)).toMatchObject({ start_at: '2026-11-20T06:00:00.000Z', end_at: null, all_day: true })
  })

  it('ida y vuelta desde un recordatorio existente', () => {
    const event = fakeEvent({
      start_at: '2026-11-20T14:00:00-06:00',
      end_at: '2026-11-20T15:00:00-06:00',
      title: 'Reunión',
      location: 'Sala 2',
      participants: [{ id: 'u1', full_name: 'Carlos Mora', color: '#16a34a' }],
      my_alerts: [30, 1440],
    })
    const payload = toPayload(valuesFromEvent(event))
    expect(new Date(payload.start_at).getTime()).toBe(new Date(event.start_at).getTime())
    expect(new Date(payload.end_at!).getTime()).toBe(new Date(event.end_at!).getTime())
    expect(payload.location).toBe('Sala 2')
    expect(payload.participant_ids).toEqual(['u1'])
    expect(payload.alerts).toEqual([30, 1440])
  })

  it('un recordatorio nuevo trae el aviso por defecto de 15 min', () => {
    expect(newReminderValues({ date: '2026-11-20' }, now).alerts).toEqual([15])
  })
})

describe('asLink', () => {
  it('reconoce enlaces de reuniones', () => {
    expect(asLink('https://meet.google.com/abc')).toBe('https://meet.google.com/abc')
    expect(asLink('www.ejemplo.com')).toBe('https://www.ejemplo.com')
    expect(asLink('Sala 2')).toBeNull()
    expect(asLink('javascript:alert(1)')).toBeNull()
  })
})
