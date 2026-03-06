import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
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

describe('deleted-context', () => {
  it('exports DeletedProvider and useDeleted', async () => {
    const mod = await import('../DeletedContext')
    expect(typeof mod.DeletedProvider).toBe('function')
    expect(typeof mod.useDeleted).toBe('function')
  })

  it('exports isWithin30Days utility', async () => {
    const { isWithin30Days } = await import('../DeletedContext')
    expect(isWithin30Days(new Date())).toBe(true)
    expect(isWithin30Days(new Date(Date.now() - 31 * 86_400_000))).toBe(false)
  })
})
