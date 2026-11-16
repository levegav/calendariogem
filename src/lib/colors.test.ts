import { describe, expect, it } from 'vitest'
import {
  checkColor,
  colorDistance,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  normalizeHex,
  readableTextOn,
  rgbToHex,
  SIMILAR_THRESHOLD,
  SUGGESTED_COLORS,
  suggestColor,
} from './colors'

describe('normalizeHex', () => {
  it('acepta formatos comunes y devuelve #rrggbb en minúsculas', () => {
    expect(normalizeHex('#A1B2C3')).toBe('#a1b2c3')
    expect(normalizeHex(' a1b2c3 ')).toBe('#a1b2c3')
    expect(normalizeHex('#abc')).toBe('#aabbcc')
  })

  it('rechaza valores inválidos', () => {
    expect(normalizeHex('azul')).toBeNull()
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('')).toBeNull()
  })
})

describe('conversión RGB', () => {
  it('convierte de ida y vuelta', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000')
  })

  it('limita los canales a 0–255', () => {
    expect(rgbToHex({ r: 300, g: -5, b: Number.NaN })).toBe('#ff0000')
  })
})

describe('parecido entre colores', () => {
  it('es 0 para colores idénticos y grande para colores opuestos', () => {
    expect(colorDistance('#2563eb', '#2563eb')).toBe(0)
    expect(colorDistance('#000000', '#ffffff')).toBeGreaterThan(90)
  })

  it('la paleta sugerida es distinguible entre sí', () => {
    for (const a of SUGGESTED_COLORS) {
      for (const b of SUGGESTED_COLORS) {
        if (a !== b) expect(colorDistance(a, b)).toBeGreaterThanOrEqual(SIMILAR_THRESHOLD)
      }
    }
  })

  const users = [
    { id: '1', full_name: 'Luis', color: '#2563eb' },
    { id: '2', full_name: 'Carlos', color: '#16a34a' },
  ]

  it('detecta un color ya usado por otro usuario', () => {
    expect(checkColor('#2563EB', users).taken?.full_name).toBe('Luis')
  })

  it('no se compara con el propio usuario', () => {
    expect(checkColor('#2563eb', users, '1')).toEqual({ taken: null, similar: [] })
  })

  it('advierte de colores muy parecidos', () => {
    const result = checkColor('#2a66ee', users)
    expect(result.taken).toBeNull()
    expect(result.similar.map((u) => u.full_name)).toEqual(['Luis'])
  })

  it('no advierte de colores claramente distintos', () => {
    expect(checkColor('#ea580c', users)).toEqual({ taken: null, similar: [] })
  })
})

describe('suggestColor', () => {
  it('sugiere el primer color libre de la paleta', () => {
    expect(suggestColor([])).toBe(SUGGESTED_COLORS[0])
    expect(suggestColor([SUGGESTED_COLORS[0]])).toBe(SUGGESTED_COLORS[1])
  })

  it('con la paleta agotada devuelve igualmente un color válido', () => {
    expect(normalizeHex(suggestColor(SUGGESTED_COLORS))).not.toBeNull()
  })
})

describe('readableTextOn', () => {
  it('elige texto oscuro en fondos claros y blanco en oscuros', () => {
    expect(readableTextOn('#ffff00')).toBe('#111827')
    expect(readableTextOn('#1e3a8a')).toBe('#ffffff')
  })
})

describe('conversión HSV', () => {
  it('convierte colores puros', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 })
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff')
  })

  it('el blanco y el negro no tienen saturación', () => {
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 })
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('ida y vuelta conserva el color', () => {
    for (const color of [...SUGGESTED_COLORS, '#123456', '#abcdef', '#808080']) {
      expect(hsvToHex(hexToHsv(color))).toBe(color)
    }
  })
})
