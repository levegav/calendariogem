import { describe, expect, it } from 'vitest'
import { AppError, toSpanishMessage } from './errors'

describe('toSpanishMessage', () => {
  it('traduce errores de inicio de sesión', () => {
    expect(toSpanishMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Usuario o contraseña incorrectos.',
    )
    expect(toSpanishMessage({ message: 'Invalid login credentials' })).toBe('Usuario o contraseña incorrectos.')
    expect(toSpanishMessage({ code: 'user_banned', message: 'User is banned' })).toBe(
      'Su usuario está desactivado. Consulte al administrador.',
    )
  })

  it('muestra los mensajes de negocio de la base de datos', () => {
    expect(toSpanishMessage({ code: 'P0001', message: 'La fecha no puede ser futura.' })).toBe(
      'La fecha no puede ser futura.',
    )
    expect(toSpanishMessage({ code: '42501', message: 'Solo el administrador puede modificar usuarios.' })).toBe(
      'Solo el administrador puede modificar usuarios.',
    )
  })

  it('oculta mensajes técnicos de permisos', () => {
    expect(toSpanishMessage({ code: '42501', message: 'permission denied for table products' })).toBe(
      'No tiene permiso para realizar esta acción.',
    )
  })

  it('reconoce errores de conexión', () => {
    expect(toSpanishMessage(new TypeError('Failed to fetch'))).toBe(
      'No hay conexión con el servidor. Verifique su internet e intente de nuevo.',
    )
  })

  it('respeta los mensajes ya redactados para el usuario', () => {
    expect(toSpanishMessage(new AppError('Ese nombre de usuario ya existe.'))).toBe('Ese nombre de usuario ya existe.')
  })

  it('usa un mensaje genérico para errores desconocidos', () => {
    expect(toSpanishMessage(new Error('boom'))).toBe('Ocurrió un error inesperado. Intente de nuevo.')
    expect(toSpanishMessage(null)).toBe('Ocurrió un error inesperado. Intente de nuevo.')
  })
})
