import { describe, expect, it, vi } from 'vitest'
import { checkServer } from './health'

const env = { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_123' }

describe('checkServer', () => {
  it('consulta el health de Auth con la clave pública', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(checkServer(fetchFn, env)).resolves.toBe('ok')
    expect(fetchFn).toHaveBeenCalledWith('https://abc.supabase.co/auth/v1/health', {
      headers: { apikey: 'sb_publishable_123' },
    })
  })

  it('devuelve error si el servidor responde mal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    await expect(checkServer(fetchFn, env)).resolves.toBe('error')
  })

  it('devuelve error si no hay conexión', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(checkServer(fetchFn, env)).resolves.toBe('error')
  })
})
