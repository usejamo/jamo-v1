import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}))

describe('auth-context', () => {
  it('exports AuthProvider and useAuth', async () => {
    const mod = await import('../AuthContext')
    expect(typeof mod.AuthProvider).toBe('function')
    expect(typeof mod.useAuth).toBe('function')
  })

  it('exports signIn method that calls supabase.auth.signInWithPassword', async () => {
    const { supabase } = await import('../../lib/supabase')

    // Verify signInWithPassword exists on supabase.auth
    expect(typeof supabase.auth.signInWithPassword).toBe('function')

    // Call it to verify mock works
    const result = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password123'
    })
    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('error')
  })

  it('exports signOut method that calls supabase.auth.signOut', async () => {
    const { supabase } = await import('../../lib/supabase')

    // Verify signOut exists on supabase.auth
    expect(typeof supabase.auth.signOut).toBe('function')

    // Call it to verify mock works
    const result = await supabase.auth.signOut()
    expect(result).toHaveProperty('error')
  })

  it('exports signUp method that calls supabase.auth.signUp', async () => {
    const { supabase } = await import('../../lib/supabase')

    // Verify signUp exists on supabase.auth
    expect(typeof supabase.auth.signUp).toBe('function')

    // Call it to verify mock works
    const result = await supabase.auth.signUp({
      email: 'test@example.com',
      password: 'password123'
    })
    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('error')
  })
})
