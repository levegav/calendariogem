import type { Database } from '../types/database.types'

export type UserRole = Database['public']['Enums']['user_role']

/** Dominio interno: los usuarios inician sesión con nombre de usuario, no con correo. */
export const USERNAME_DOMAIN = 'calendariogem.local'

/** Igual que la restricción `profiles_username_format` de la base de datos. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  user: 'Usuario',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Gestiona usuarios, colores, categorías y la configuración. También usa su propio calendario.',
  user: 'Crea y administra sus recordatorios, etiqueta a otros y ve los calendarios de los demás.',
}

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin'
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase()
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_DOMAIN}`
}

/** Devuelve el problema de la contraseña, o null si es válida. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (password.length > 72) return 'La contraseña no puede superar 72 caracteres.'
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir letras y números.'
  }
  return null
}

// Sin caracteres confusos (0/O, 1/l/I) para dictarla o escribirla fácilmente.
const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
const DIGITS = '23456789'

/** Contraseña temporal aleatoria que cumple la política (letras y números). */
export function generateTemporaryPassword(length = 10): string {
  const alphabet = LETTERS + DIGITS
  const random = new Uint32Array(length + 2)
  crypto.getRandomValues(random)

  const chars = Array.from(random.slice(0, length), (n) => alphabet[n % alphabet.length])
  chars[0] = LETTERS[random[length] % LETTERS.length]
  chars[1 + (random[length + 1] % (length - 1))] = DIGITS[random[length + 1] % DIGITS.length]
  return chars.join('')
}
