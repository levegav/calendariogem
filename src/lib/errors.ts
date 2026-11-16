/** Error cuyo mensaje ya está redactado para el usuario (en español). */
export class AppError extends Error {}

const GENERIC = 'Ocurrió un error inesperado. Intente de nuevo.'
const CONNECTION = 'No hay conexión con el servidor. Verifique su internet e intente de nuevo.'
const NO_PERMISSION = 'No tiene permiso para realizar esta acción.'

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Usuario o contraseña incorrectos.',
  user_banned: 'Su usuario está desactivado. Consulte al administrador.',
  weak_password: 'La contraseña no cumple los requisitos: mínimo 8 caracteres con letras y números.',
  same_password: 'La nueva contraseña debe ser distinta a la actual.',
  over_request_rate_limit: 'Demasiados intentos. Espere unos minutos e intente de nuevo.',
  session_not_found: 'Su sesión expiró. Inicie sesión de nuevo.',
  refresh_token_not_found: 'Su sesión expiró. Inicie sesión de nuevo.',
}

/** Reemplaza un error de duplicado (23505) por un mensaje específico del contexto. */
export function duplicateAs(error: unknown, message: string): unknown {
  return (error as { code?: unknown } | null)?.code === '23505' ? new AppError(message) : error
}

/** Convierte cualquier error (Auth, base de datos, red) en un mensaje comprensible. */
export function toSpanishMessage(error: unknown): string {
  if (error instanceof AppError) return error.message
  if (!error || typeof error !== 'object') return GENERIC

  const { code, message, name } = error as { code?: unknown; message?: unknown; name?: unknown }

  if (typeof code === 'string' && code in AUTH_MESSAGES) return AUTH_MESSAGES[code]
  if (typeof message !== 'string') return GENERIC

  if (message === 'Invalid login credentials') return AUTH_MESSAGES.invalid_credentials
  if (name === 'FunctionsFetchError' || /failed to fetch|networkerror|load failed/i.test(message)) {
    return CONNECTION
  }

  // Reglas de negocio de la base de datos: el mensaje ya viene en español.
  if (code === 'P0001') return message
  if (code === '42501') {
    return /^(permission denied|new row violates)/i.test(message) ? NO_PERMISSION : message
  }
  if (code === '23505') return 'Ya existe un registro con ese nombre.'

  return GENERIC
}
