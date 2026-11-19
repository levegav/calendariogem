/**
 * Lo último que este navegador ya anunció con sonido, por usuario (una marca
 * para las notificaciones y otra para las decisiones Conservar / Eliminar).
 * Sirve para que al entrar suene una sola vez si llegó algo mientras la persona
 * no estaba, y para no repetir el sonido por lo mismo.
 */

export type AnnouncedScope = 'notificaciones' | 'decisiones'

const KEY = 'anunciado'

export function readAnnounced(scope: AnnouncedScope, userId: string): number {
  try {
    const value = Number(localStorage.getItem(`${KEY}:${scope}:${userId}`))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

function saveAnnounced(scope: AnnouncedScope, userId: string, id: number): void {
  try {
    localStorage.setItem(`${KEY}:${scope}:${userId}`, String(id))
  } catch {
    // sin almacenamiento local: puede volver a sonar al entrar
  }
}

/**
 * Devuelve los elementos sin leer que aún no se habían anunciado y anota el más
 * nuevo de la lista como anunciado.
 */
export function takeUnannounced<T extends { id: number; read_at?: string | null }>(
  scope: AnnouncedScope,
  userId: string,
  items: T[],
): T[] {
  const last = readAnnounced(scope, userId)
  const fresh = items.filter((item) => !item.read_at && item.id > last)
  const newest = items.reduce((max, item) => Math.max(max, item.id), last)
  if (newest > last) saveAnnounced(scope, userId, newest)
  return fresh
}
