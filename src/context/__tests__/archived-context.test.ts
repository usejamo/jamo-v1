import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { ArchivedProvider, useArchived } from '../ArchivedContext'

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
  it('exposes empty archivedIds set initially', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ArchivedProvider, null, children)
    const { result } = renderHook(() => useArchived(), { wrapper })
    await waitFor(() => expect(result.current.archivedIds).toBeDefined())
    expect(result.current.archivedIds).toBeInstanceOf(Set)
  })

  it('exposes archive and restore functions', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ArchivedProvider, null, children)
    const { result } = renderHook(() => useArchived(), { wrapper })
    expect(typeof result.current.archive).toBe('function')
    expect(typeof result.current.restore).toBe('function')
  })
})
