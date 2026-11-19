import type { CalendarEvent } from './types'

/** Recordatorio de prueba; las horas se escriben en Costa Rica (−06:00). */
export function fakeEvent(overrides: Partial<CalendarEvent> & { start_at: string }): CalendarEvent {
  return {
    id: Math.floor(Math.random() * 1e6),
    title: 'Recordatorio',
    description: null,
    end_at: null,
    all_day: false,
    location: null,
    note: null,
    category: { id: 1, name: 'Reunión', color: '#2563eb', active: true },
    owner: { id: '00000000-0000-0000-0000-000000000001', full_name: 'Ana Rodríguez', color: '#ea580c' },
    is_general: false,
    participants: [],
    my_alerts: [15],
    ...overrides,
  }
}
