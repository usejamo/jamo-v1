// src/lib/supabase.ts
// Singleton Supabase client — import this everywhere, never call createClient() in components.
// Source pattern: https://supabase.com/docs/guides/getting-started/quickstarts/reactjs
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local'
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey)
