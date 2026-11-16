/** Colores identificadores de usuario: formato, conversión RGB y parecido entre colores. */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Misma paleta inicial que `private.next_free_color()` en la base de datos. */
export const SUGGESTED_COLORS = [
  '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2',
  '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b45309', '#475569',
  '#e11d48', '#0d9488', '#65a30d', '#c026d3',
]

/** Diferencia perceptual (ΔE CIE76) por debajo de la cual dos colores se confunden a simple vista. */
export const SIMILAR_THRESHOLD = 15

/** Acepta "#abc", "abc", "#AABBCC" o "aabbcc" y devuelve "#aabbcc", o null si no es válido. */
export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(value)) {
    return '#' + value.split('').map((c) => c + c).join('')
  }
  return /^[0-9a-f]{6}$/.test(value) ? `#${value}` : null
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex)
  if (!normalized) throw new Error(`Color no válido: ${hex}`)
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(255, Math.max(0, Math.round(value)))
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return '#' + [r, g, b].map((v) => clampChannel(v).toString(16).padStart(2, '0')).join('')
}

/** sRGB → CIELAB (iluminante D65). */
function toLab({ r, g, b }: Rgb): [number, number, number] {
  const linear = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const [lr, lg, lb] = linear
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Diferencia perceptual entre dos colores (0 = idénticos). */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = toLab(hexToRgb(a))
  const [l2, a2, b2] = toLab(hexToRgb(b))
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

export interface ColorOwner {
  id: string
  full_name: string
  color: string
}

export interface ColorCheck<T extends ColorOwner> {
  /** Usuario que ya tiene exactamente este color (impide guardar). */
  taken: T | null
  /** Usuarios con un color muy parecido (solo es una advertencia). */
  similar: T[]
}

/** Compara un color con los de los demás usuarios (excluye al propio usuario). */
export function checkColor<T extends ColorOwner>(color: string, users: T[], excludeId?: string): ColorCheck<T> {
  const normalized = normalizeHex(color)
  if (!normalized) return { taken: null, similar: [] }
  const others = users.filter((u) => u.id !== excludeId)
  const taken = others.find((u) => u.color === normalized) ?? null
  const similar = others.filter(
    (u) => u.color !== normalized && colorDistance(u.color, normalized) < SIMILAR_THRESHOLD,
  )
  return { taken, similar }
}

/** Primer color sugerido que no esté en uso ni sea parecido a uno en uso. */
export function suggestColor(usedColors: string[]): string {
  const free = SUGGESTED_COLORS.find((c) => usedColors.every((u) => colorDistance(u, c) >= SIMILAR_THRESHOLD))
  if (free) return free
  const unused = SUGGESTED_COLORS.find((c) => !usedColors.includes(c))
  if (unused) return unused
  // Paleta agotada: un color aleatorio de intensidad media.
  const channel = () => 40 + Math.floor(Math.random() * 176)
  return rgbToHex({ r: channel(), g: channel(), b: channel() })
}

/** Texto legible (blanco o casi negro) sobre un fondo de este color. */
export function readableTextOn(color: string): '#ffffff' | '#111827' {
  const { r, g, b } = hexToRgb(color)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#111827' : '#ffffff'
}

/** Indica si el color se puede guardar (válido y no usado por otro usuario). */
export function isColorAvailable(color: string, users: ColorOwner[], excludeId?: string): boolean {
  return normalizeHex(color) !== null && checkColor(color, users, excludeId).taken === null
}
