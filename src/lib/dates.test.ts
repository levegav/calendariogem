import { describe, expect, it } from 'vitest'
import {
  parseTime,
  addDays,
  addMonths,
  addYears,
  daysBetween,
  formatLongDate,
  formatMonthYear,
  formatTime,
  formatWeekRange,
  fromCostaRica,
  hhmmToMinutes,
  isDateKey,
  minutesToHhmm,
  monthGrid,
  startOfWeek,
  TIME_ZONE,
  todayKey,
  toCostaRica,
  weekday,
  weekDays,
} from './dates'

describe('hora de Costa Rica', () => {
  it('convierte un instante UTC al día y la hora de Costa Rica', () => {
    expect(toCostaRica('2026-11-17T03:30:00Z')).toEqual({ date: '2026-11-16', minutes: 21 * 60 + 30 })
  })

  it('convierte un día y hora de Costa Rica a UTC', () => {
    expect(fromCostaRica('2026-11-16', 14 * 60 + 30)).toBe('2026-11-16T20:30:00.000Z')
    expect(fromCostaRica('2026-11-16')).toBe('2026-11-16T06:00:00.000Z')
  })

  it('"hoy" depende de Costa Rica, no del dispositivo', () => {
    // 1:00 a. m. UTC del 17 = 7:00 p. m. del 16 en Costa Rica.
    expect(todayKey(new Date('2026-11-17T01:00:00Z'))).toBe('2026-11-16')
  })

  it('coincide con la base de zonas horarias (Costa Rica no tiene horario de verano)', () => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    for (const iso of ['2026-01-15T05:59:00Z', '2026-04-05T12:00:00Z', '2026-07-01T23:10:00Z', '2026-11-01T06:00:00Z']) {
      const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
      const { date, minutes } = toCostaRica(iso)
      expect(date).toBe(`${parts.year}-${parts.month}-${parts.day}`)
      expect(minutes).toBe(Number(parts.hour) * 60 + Number(parts.minute))
    }
  })
})

describe('aritmética de fechas', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('suma meses ajustando al último día disponible', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-11-16', -11)).toBe('2025-12-16')
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28')
  })

  it('la semana empieza el lunes', () => {
    expect(weekday('2026-11-16')).toBe(0)
    expect(weekday('2026-11-22')).toBe(6)
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16')
    expect(weekDays('2026-11-18')).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
    ])
  })

  it('la cuadrícula del mes tiene 6 semanas y empieza en lunes', () => {
    const grid = monthGrid('2026-11-16')
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-10-26')
    expect(weekday(grid[0])).toBe(0)
    expect(grid).toContain('2026-11-30')
  })

  it('cuenta los días entre fechas', () => {
    expect(daysBetween('2026-11-16', '2026-11-22')).toBe(6)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('valida fechas', () => {
    expect(isDateKey('2026-11-16')).toBe(true)
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('16/11/2026')).toBe(false)
  })
})

describe('textos', () => {
  it('fecha larga, mes y semana', () => {
    expect(formatLongDate('2026-11-16')).toBe('Lunes 16 de noviembre de 2026')
    expect(formatMonthYear('2026-11-16')).toBe('Noviembre 2026')
    expect(formatWeekRange('2026-11-18')).toBe('16 – 22 nov 2026')
    expect(formatWeekRange('2026-12-02')).toBe('30 nov – 6 dic 2026')
    expect(formatWeekRange('2026-12-30')).toBe('28 dic 2026 – 3 ene 2027')
  })

  it('horas en formato de 12 horas', () => {
    expect(formatTime(0)).toBe('12:00 a. m.')
    expect(formatTime(14 * 60 + 5)).toBe('2:05 p. m.')
    expect(formatTime(12 * 60)).toBe('12:00 p. m.')
  })

  it('convierte entre "HH:MM" y minutos', () => {
    expect(minutesToHhmm(9 * 60 + 5)).toBe('09:05')
    expect(hhmmToMinutes('23:59')).toBe(1439)
    expect(hhmmToMinutes('24:00')).toBeNull()
  })
})

describe('parseTime', () => {
  it('acepta la hora escrita de varias formas', () => {
    expect(parseTime('10:03 a. m.')).toBe(10 * 60 + 3)
    expect(parseTime('10:03 AM')).toBe(10 * 60 + 3)
    expect(parseTime('10:03pm')).toBe(22 * 60 + 3)
    expect(parseTime('3 p. m.')).toBe(15 * 60)
    expect(parseTime('3p')).toBe(15 * 60)
    expect(parseTime('12:00 p. m.')).toBe(12 * 60)
    expect(parseTime('12:15 a. m.')).toBe(15)
    expect(parseTime('15:20')).toBe(15 * 60 + 20)
    expect(parseTime('0:00')).toBe(0)
    expect(parseTime('1003')).toBe(10 * 60 + 3)
    expect(parseTime(' 9 ')).toBe(9 * 60)
  })

  it('rechaza lo que no es una hora', () => {
    for (const text of ['', 'diez', '24:00', '10:60', '13 pm', '0 am', '10:3', '12345']) {
      expect(parseTime(text), text).toBeNull()
    }
  })
})
