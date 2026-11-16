import { readableTextOn } from '../lib/colors'

/** Iniciales del nombre (máximo 2), p. ej. "María Pérez" → "MP". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/** Círculo con las iniciales del usuario sobre su color identificador. */
export function UserAvatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ background: color, color: readableTextOn(color), width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  )
}
