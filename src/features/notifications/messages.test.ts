import { describe, expect, it } from 'vitest'
import { alertLabel, alertMoment, alertOptions, defaultAlerts } from './alerts'
import { notificationDate, notificationText, timeAgo } from './messages'
import type { AppNotification } from './types'

const carlos = { id: 'carlos', full_name: 'Carlos Mora', color: '#16a34a' }

function fake(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 1,
    kind: 'etiquetado',
    reminder_id: 10,
    reminder_title: 'Reunión de equipo',
    data: { start_at: '2026-11-18T14:00:00-06:00', all_day: false },
    created_at: '2026-11-17T16:00:00Z',
    read_at: null,
    actor: carlos,
    ...overrides,
  }
}

describe('notificationText', () => {
  it('reuniones de Outlook: nueva y modificada', () => {
    const nueva = fake({
      kind: 'outlook',
      actor: null,
      reminder_id: null,
      reminder_title: 'Comité de proyecto',
      data: { start_at: '2026-11-18T14:00:00-06:00', all_day: false, accion: 'nueva', organizer: 'Ana Mora' },
    })
    expect(notificationText(nueva)).toEqual({
      text: 'Nueva reunión de Outlook: «Comité de proyecto» (organiza Ana Mora).',
      detail: 'mié 18 nov, 2:00 p. m.',
    })
    const cambio = fake({
      kind: 'outlook',
      actor: null,
      reminder_title: 'Comité de proyecto',
      data: {
        start_at: '2026-11-18T15:00:00-06:00',
        all_day: false,
        accion: 'modificada',
        changes: ['horario'],
        before: { title: 'Comité de proyecto', start_at: '2026-11-18T14:00:00-06:00', end_at: null, all_day: false },
      },
    })
    expect(notificationText(cambio)).toEqual({
      text: 'Cambió la reunión de Outlook «Comité de proyecto»: cambió la fecha y hora.',
      detail: 'Ahora: mié 18 nov, 3:00 p. m. (antes: mié 18 nov, 2:00 p. m.)',
    })
  })

  it('avisos con minutos que no son horas exactas (copiados de Outlook)', () => {
    expect(alertMoment(10, false)).toBe('Empieza en 10 min')
    expect(alertMoment(90, false)).toBe('Empieza en 1 h 30 min')
    expect(alertMoment(180, false)).toBe('Empieza en 3 horas')
  })

  it('calendario general: publicado, modificado, quitado y eliminado', () => {
    const general = (accion: 'publicado' | 'modificado' | 'retirado' | 'eliminado') =>
      notificationText(fake({ kind: 'general', data: { start_at: '2026-11-18T14:00:00-06:00', all_day: false, accion } })).text
    expect(general('publicado')).toBe('Carlos Mora publicó «Reunión de equipo» en el calendario general.')
    expect(general('retirado')).toBe('Carlos Mora quitó «Reunión de equipo» del calendario general.')
    expect(general('eliminado')).toBe('Carlos Mora eliminó «Reunión de equipo» del calendario general.')
    const changed = fake({
      kind: 'general',
      data: {
        start_at: '2026-11-19T09:00:00-06:00',
        all_day: false,
        accion: 'modificado',
        changes: ['horario'],
        before: { title: 'Reunión de equipo', start_at: '2026-11-18T14:00:00-06:00', end_at: null, all_day: false },
      },
    })
    expect(notificationText(changed)).toEqual({
      text: 'Carlos Mora modificó «Reunión de equipo» en el calendario general: cambió la fecha y hora.',
      detail: 'Ahora: jue 19 nov, 9:00 a. m. (antes: mié 18 nov, 2:00 p. m.)',
    })
  })

  it('etiquetado, quitado y salida dicen quién y cuándo es', () => {
    expect(notificationText(fake({}))).toEqual({
      text: 'Carlos Mora le etiquetó en «Reunión de equipo».',
      detail: 'mié 18 nov, 2:00 p. m.',
    })
    expect(notificationText(fake({ kind: 'quitado' })).text).toBe('Carlos Mora le quitó de «Reunión de equipo».')
    expect(notificationText(fake({ kind: 'salida' })).text).toBe('Carlos Mora salió de «Reunión de equipo».')
  })

  it('modificado indica qué cambió y cómo era antes', () => {
    const n = fake({
      kind: 'modificado',
      data: {
        start_at: '2026-11-19T09:00:00-06:00',
        all_day: false,
        changes: ['titulo', 'horario', 'ubicacion'],
        before: { title: 'Reunión', start_at: '2026-11-18T14:00:00-06:00', end_at: null, all_day: false },
      },
    })
    expect(notificationText(n)).toEqual({
      text: 'Carlos Mora modificó «Reunión de equipo»: cambió el título, la fecha y hora y la ubicación.',
      detail: 'Ahora: jue 19 nov, 9:00 a. m. (antes: mié 18 nov, 2:00 p. m.) · Antes se llamaba «Reunión»',
    })
  })

  it('aviso previo: cuánto falta y cuándo es', () => {
    const n = fake({ kind: 'aviso', actor: null, data: { start_at: '2026-11-18T14:00:00-06:00', all_day: false, minutes_before: 15 } })
    expect(notificationText(n)).toEqual({ text: 'Empieza en 15 min: «Reunión de equipo»', detail: 'mié 18 nov, 2:00 p. m.' })
    const allDay = fake({ kind: 'aviso', actor: null, data: { start_at: '2026-11-18T00:00:00-06:00', all_day: true, minutes_before: 1440 } })
    expect(notificationText(allDay)).toEqual({ text: 'Es mañana: «Reunión de equipo»', detail: 'mié 18 nov (todo el día)' })
  })

  it('el día del recordatorio es el de Costa Rica', () => {
    expect(notificationDate(fake({ data: { start_at: '2026-11-19T03:00:00Z' } }))).toBe('2026-11-18')
    expect(notificationDate(fake({ data: {} }))).toBeNull()
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-11-17T16:00:00Z')
  it('describe hace cuánto llegó', () => {
    expect(timeAgo('2026-11-17T15:59:40Z', now)).toBe('ahora')
    expect(timeAgo('2026-11-17T15:55:00Z', now)).toBe('hace 5 min')
    expect(timeAgo('2026-11-17T13:00:00Z', now)).toBe('hace 3 h')
    expect(timeAgo('2026-11-16T14:00:00Z', now)).toBe('ayer')
    expect(timeAgo('2026-11-10T14:00:00Z', now)).toBe('mar 10 nov')
  })
})

describe('avisos previos', () => {
  it('por defecto: 15 min antes, o el día anterior si es de todo el día', () => {
    expect(defaultAlerts(false)).toEqual([15])
    expect(defaultAlerts(true)).toEqual([1440])
  })

  it('opciones y textos según el tipo de recordatorio', () => {
    expect(alertOptions(true)).toEqual([0, 1440, 2880, 10080])
    expect(alertOptions(true, [15])).toEqual([0, 15, 1440, 2880, 10080])
    expect(alertLabel(0, false)).toBe('A la hora')
    expect(alertLabel(0, true)).toBe('El mismo día')
    expect(alertLabel(1440, true)).toBe('El día anterior')
    expect(alertLabel(120, false)).toBe('2 horas antes')
    expect(alertMoment(0, false)).toBe('Empieza ahora')
    expect(alertMoment(120, false)).toBe('Empieza en 2 horas')
    expect(alertMoment(0, true)).toBe('Es hoy')
  })
})
