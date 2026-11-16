export type ThemePreference = 'claro' | 'oscuro' | 'sistema'

export const THEME_LABELS: Record<ThemePreference, string> = {
  claro: 'Claro',
  oscuro: 'Oscuro',
  sistema: 'Automático',
}

export const THEME_OPTIONS: ThemePreference[] = ['claro', 'oscuro', 'sistema']

// Copia local del último tema usado: evita un destello claro al abrir la app
// antes de que llegue el perfil (y se usa también en la pantalla de ingreso).
const STORAGE_KEY = 'tema'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'claro' || value === 'oscuro' || value === 'sistema'
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function resolveTheme(preference: ThemePreference, prefersDark = systemPrefersDark()): 'light' | 'dark' {
  if (preference === 'sistema') return prefersDark ? 'dark' : 'light'
  return preference === 'oscuro' ? 'dark' : 'light'
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(preference)
}

export function readCachedTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isThemePreference(value) ? value : 'sistema'
  } catch {
    return 'sistema'
  }
}

export function cacheTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // sin almacenamiento local (modo privado): solo se pierde la copia
  }
}

/** Aplica el tema y, si es "Automático", lo actualiza cuando cambia el del sistema. */
export function watchTheme(preference: ThemePreference): () => void {
  applyTheme(preference)
  cacheTheme(preference)
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (preference !== 'sistema' || !media) return () => {}
  const onChange = () => applyTheme(preference)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
