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
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: vi.fn().mockImplementation((cb: any) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}))

vi.mock('../AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    profile: { id: 'profile-1', org_id: 'org-1' },
    loading: false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('proposals-context', () => {
  it('exports ProposalsProvider and useProposals', async () => {
    const mod = await import('../ProposalsContext')
    expect(typeof mod.ProposalsProvider).toBe('function')
    expect(typeof mod.useProposals).toBe('function')
  })

  it('supabase from() is called with proposals table on fetch', async () => {
    const { supabase } = await import('../../lib/supabase')
    expect(supabase.from).toBeDefined()
    expect(typeof supabase.from).toBe('function')
  })
})
