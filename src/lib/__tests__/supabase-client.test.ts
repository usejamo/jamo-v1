import { describe, it, expect, vi } from 'vitest'
import { supabase } from '../../test/mocks/supabase'

// STUB: will pass once src/lib/supabase.ts is created in Plan 01-01
// The real import path (../supabase) is mocked via vi.mock in future tests once the file exists.

describe('supabase-client', () => {
  it.skip('singleton is created with env vars', () => {
    // Will test the real src/lib/supabase.ts singleton once it exists in Plan 01-01
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
    expect(supabase.auth).toBeDefined()
  })
})
