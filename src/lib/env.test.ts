import { describe, expect, it } from 'vitest'
import { readSupabaseEnv } from './env'

function fakeJwt(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.firma`
}

describe('readSupabaseEnv', () => {
  it('devuelve la configuración válida sin espacios', () => {
    expect(
      readSupabaseEnv({
        VITE_SUPABASE_URL: ' https://abc.supabase.co ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
      }),
    ).toEqual({ url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_123' })
  })

  it('indica qué variables faltan', () => {
    expect(() => readSupabaseEnv({})).toThrow(
      /VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY/,
    )
  })

  it('rechaza una clave secreta nueva', () => {
    expect(() =>
      readSupabaseEnv({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_123',
      }),
    ).toThrow(/clave secreta/)
  })

  it('rechaza una clave service_role heredada', () => {
    expect(() =>
      readSupabaseEnv({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: fakeJwt({ role: 'service_role' }),
      }),
    ).toThrow(/clave secreta/)
  })

  it('acepta una clave anon heredada', () => {
    const anonKey = fakeJwt({ role: 'anon' })
    expect(
      readSupabaseEnv({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
      }).publishableKey,
    ).toBe(anonKey)
  })
})
