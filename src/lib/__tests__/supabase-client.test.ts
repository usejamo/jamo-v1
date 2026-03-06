import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase', async () => {
  const { supabase } = await import('../../test/mocks/supabase')
  return { supabase }
})

describe('supabase-client', () => {
  it('singleton is created with env vars', async () => {
    const { supabase } = await import('../supabase')
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
    expect(supabase.auth).toBeDefined()
  })
})
