import type { CSSProperties } from 'react'
import type { CalendarEvent } from './types'

/** Nombre que se muestra para el calendario compartido. */
export const GENERAL_NAME = 'Calendario general'

/** Color fijo del calendario general: un degradado con todos los colores (ver global.css). */
export const GENERAL_COLOR = 'var(--rainbow)'

/**
 * Variables de color de una ficha: la línea con el color del creador, o el
 * arcoíris si está en el calendario general (data-general activa sus estilos).
 */
export function eventStyle(event: CalendarEvent): CSSProperties {
  return {
    '--owner-color': event.is_general ? 'var(--general-tint)' : event.owner.color,
    '--category-color': event.category.color,
  } as CSSProperties
}

/** Fondo de la marca de un recordatorio (punto o línea): el creador o el arcoíris. */
export function eventMark(event: CalendarEvent): string {
  return event.is_general ? GENERAL_COLOR : event.owner.color
}

/** "Reunión, calendario general, creado por Ana" (para lectores de pantalla y la ayuda al pasar el mouse). */
export function eventOrigin(event: CalendarEvent, separator = ', '): string {
  const creator = `creado por ${event.owner.full_name}`
  return event.is_general ? `${GENERAL_NAME.toLowerCase()}${separator}${creator}` : creator
}
