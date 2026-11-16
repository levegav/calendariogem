import type { ThemePreference } from '../../lib/theme'
import { supabase } from '../../lib/supabase'

export async function saveMyTheme(theme: ThemePreference): Promise<void> {
  const { error } = await supabase.rpc('set_my_theme', { p_theme: theme })
  if (error) throw error
}
