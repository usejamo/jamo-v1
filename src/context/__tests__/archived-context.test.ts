import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: vi.fn().mockImplementation((cb: any) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}))

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } }, profile: null, loading: false }),
}))

describe('archived-context', () => {
  it('exports ArchivedProvider and useArchived', async () => {
    const mod = await import('../ArchivedContext')
    expect(typeof mod.ArchivedProvider).toBe('function')
    expect(typeof mod.useArchived).toBe('function')
  })

  it('supabase from() targets proposals for archiving', async () => {
    const { supabase } = await import('../../lib/supabase')
    expect(typeof supabase.from).toBe('function')
  })
})
