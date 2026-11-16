import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from './env'

const { url, publishableKey } = readSupabaseEnv()

export const supabase = createClient(url, publishableKey)
