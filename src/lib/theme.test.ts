import { afterEach, describe, expect, it } from 'vitest'
import { readCachedTheme, resolveTheme, watchTheme } from './theme'

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('resolveTheme', () => {
  it('Claro y Oscuro no dependen del sistema', () => {
    expect(resolveTheme('claro', true)).toBe('light')
    expect(resolveTheme('oscuro', false)).toBe('dark')
  })

  it('Automático sigue al sistema', () => {
    expect(resolveTheme('sistema', true)).toBe('dark')
    expect(resolveTheme('sistema', false)).toBe('light')
  })
})

describe('watchTheme', () => {
  it('aplica el tema a la página y lo recuerda para el próximo inicio', () => {
    const stop = watchTheme('oscuro')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(readCachedTheme()).toBe('oscuro')
    stop()
  })

  it('sin preferencia guardada usa Automático', () => {
    expect(readCachedTheme()).toBe('sistema')
    localStorage.setItem('tema', 'otro')
    expect(readCachedTheme()).toBe('sistema')
  })
})
