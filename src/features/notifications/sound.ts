/**
 * Sonidos de notificación generados con Web Audio (sin archivos): un timbre
 * corto tipo marimba.
 * - Aviso previo: tres notas ascendentes (mi – sol# – si).
 * - Otras notificaciones: dos notas más suaves (si – mi).
 * El navegador solo deja sonar después de que la persona tocó la página; por
 * eso el audio se "desbloquea" con el primer clic o tecla (unlockSound).
 */

export type ChimeKind = 'aviso' | 'notificacion'

const STORAGE_KEY = 'sonido-notificaciones'

const CHIMES: Record<ChimeKind, { notes: number[]; volume: number }> = {
  aviso: { notes: [659.25, 830.61, 987.77], volume: 0.18 },
  notificacion: { notes: [987.77, 1318.51], volume: 0.1 },
}

let context: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null
  context ??= new window.AudioContext()
  return context
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // sin almacenamiento local: la preferencia dura solo esta sesión
  }
}

/** Prepara el audio dentro de un gesto de la persona (clic o tecla). */
export function unlockSound(): void {
  const ctx = getContext()
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => {})
}

/** Una nota: tono principal más un armónico suave, ataque rápido y caída corta. */
function note(ctx: AudioContext, frequency: number, start: number, volume: number) {
  const duration = 0.55
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  gain.connect(ctx.destination)

  for (const [multiple, level, type] of [
    [1, 1, 'sine'],
    [4, 0.12, 'sine'],
  ] as const) {
    const partial = ctx.createGain()
    partial.gain.value = level
    partial.connect(gain)
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = frequency * multiple
    osc.connect(partial)
    osc.start(start)
    osc.stop(start + duration + 0.05)
  }
}

let waiting = false

/**
 * El navegador no deja sonar hasta que la persona tocó la página. Si todavía no
 * lo hizo (p. ej. abrió la app con la sesión guardada), el timbre espera a su
 * primer clic o tecla. Varias llamadas mientras espera suenan una sola vez.
 */
function whenAllowed(play: () => void): void {
  const activation = typeof navigator === 'undefined' ? undefined : navigator.userActivation
  if (!activation || activation.hasBeenActive) {
    play()
    return
  }
  if (waiting) return
  waiting = true
  const go = () => {
    document.removeEventListener('pointerdown', go)
    document.removeEventListener('keydown', go)
    waiting = false
    unlockSound()
    play()
  }
  document.addEventListener('pointerdown', go)
  document.addEventListener('keydown', go)
}

/** Toca el timbre si el sonido está activado (si el navegador no lo permite, no pasa nada). */
export function playChime(kind: ChimeKind, { force = false } = {}): void {
  if (!force && !isSoundEnabled()) return
  whenAllowed(() => {
    const ctx = getContext()
    if (!ctx) return
    try {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      const { notes, volume } = CHIMES[kind]
      const start = ctx.currentTime + 0.03
      notes.forEach((frequency, i) => note(ctx, frequency, start + i * 0.11, volume))
    } catch {
      // el sonido es un extra: si falla, la notificación igual se muestra
    }
  })
}
