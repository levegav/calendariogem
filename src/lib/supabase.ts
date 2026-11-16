import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { readSupabaseEnv } from './env'

const { url, publishableKey } = readSupabaseEnv()

export const supabase = createClient<Database>(url, publishableKey)
