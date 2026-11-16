import { describe, expect, it } from 'vitest'
import {
  generateTemporaryPassword,
  isAdmin,
  normalizeUsername,
  USERNAME_PATTERN,
  usernameToEmail,
  validatePassword,
} from './auth'

describe('usernameToEmail', () => {
  it('normaliza el usuario y agrega el dominio interno', () => {
    expect(usernameToEmail('  Maria.Perez ')).toBe('maria.perez@calendariogem.local')
  })
})

describe('USERNAME_PATTERN', () => {
  it('acepta letras minúsculas, números, punto, guion y guion bajo', () => {
    expect(USERNAME_PATTERN.test(normalizeUsername('Ana_2'))).toBe(true)
    expect(USERNAME_PATTERN.test('maria.perez-1')).toBe(true)
  })

  it('rechaza espacios, tildes y largos inválidos', () => {
    expect(USERNAME_PATTERN.test('ana perez')).toBe(false)
    expect(USERNAME_PATTERN.test('josé')).toBe(false)
    expect(USERNAME_PATTERN.test('ab')).toBe(false)
    expect(USERNAME_PATTERN.test('a'.repeat(31))).toBe(false)
  })
})

describe('validatePassword', () => {
  it('acepta contraseñas con 8+ caracteres, letras y números', () => {
    expect(validatePassword('Clave2026')).toBeNull()
  })

  it('explica por qué se rechaza', () => {
    expect(validatePassword('abc12')).toBe('La contraseña debe tener al menos 8 caracteres.')
    expect(validatePassword('solamenteletras')).toBe('La contraseña debe incluir letras y números.')
    expect(validatePassword('12345678')).toBe('La contraseña debe incluir letras y números.')
  })
})

describe('generateTemporaryPassword', () => {
  it('siempre cumple la política de contraseñas', () => {
    for (let i = 0; i < 500; i++) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(10)
      expect(validatePassword(password)).toBeNull()
      expect(password).not.toMatch(/[01lIO]/)
    }
  })

  it('genera valores distintos', () => {
    const values = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()))
    expect(values.size).toBe(50)
  })
})

describe('isAdmin', () => {
  it('solo el rol admin administra', () => {
    expect(isAdmin('admin')).toBe(true)
    expect(isAdmin('user')).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})
