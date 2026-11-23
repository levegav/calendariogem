/**
 * Avisos previos: cuántos minutos antes del inicio se avisa. En los de todo el
 * día la referencia son las 8:00 a. m. del día (como en la base de datos).
 */
export const TIMED_ALERTS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080]
export const ALL_DAY_ALERTS = [0, 1440, 2880, 10080]

/** Aviso que se pone si nadie elige otro (igual que en la base de datos). */
export function defaultAlerts(allDay: boolean): number[] {
  return [allDay ? 1440 : 15]
}

const TIMED_LABELS: Record<number, string> = {
  0: 'A la hora',
  5: '5 min antes',
  15: '15 min antes',
  30: '30 min antes',
  60: '1 hora antes',
  120: '2 horas antes',
  1440: '1 día antes',
  2880: '2 días antes',
  10080: '1 semana antes',
}

const ALL_DAY_LABELS: Record<number, string> = {
  0: 'El mismo día',
  1440: 'El día anterior',
  2880: '2 días antes',
  10080: '1 semana antes',
}

export function alertLabel(minutes: number, allDay: boolean): string {
  return (allDay ? ALL_DAY_LABELS[minutes] : undefined) ?? TIMED_LABELS[minutes] ?? `${minutes} min antes`
}

/** Opciones que se ofrecen; incluye las ya elegidas aunque no sean de la lista habitual. */
export function alertOptions(allDay: boolean, selected: number[] = []): number[] {
  const base = allDay ? ALL_DAY_ALERTS : TIMED_ALERTS
  return [...new Set([...base, ...selected])].sort((a, b) => a - b)
}

/** Texto del momento del aviso: "Empieza en 15 min", "Es mañana"… */
export function alertMoment(minutes: number, allDay: boolean): string {
  if (allDay) {
    if (minutes === 0) return 'Es hoy'
    if (minutes === 1440) return 'Es mañana'
    if (minutes === 2880) return 'Es pasado mañana'
    if (minutes === 10080) return 'Es en 1 semana'
  }
  if (minutes === 0) return 'Empieza ahora'
  if (minutes < 60) return `Empieza en ${minutes} min`
  if (minutes === 60) return 'Empieza en 1 hora'
  if (minutes < 1440 && minutes % 60 === 0) return `Empieza en ${minutes / 60} horas`
  if (minutes < 1440) return `Empieza en ${Math.floor(minutes / 60)} h ${minutes % 60} min`
  if (minutes === 1440) return 'Es mañana'
  if (minutes === 2880) return 'Es pasado mañana'
  if (minutes === 10080) return 'Es en 1 semana'
  return `Empieza en ${Math.round(minutes / 60)} horas`
}
