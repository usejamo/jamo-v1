import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { DeletedProvider, useDeleted } from '../DeletedContext'

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

describe('deleted-context', () => {
  it('exposes empty deletedIds set initially', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(DeletedProvider, null, children)
    const { result } = renderHook(() => useDeleted(), { wrapper })
    await waitFor(() => expect(result.current.deletedIds).toBeDefined())
    expect(result.current.deletedIds).toBeInstanceOf(Set)
  })

  it('exposes deletedAt record for "30 days remaining" display', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(DeletedProvider, null, children)
    const { result } = renderHook(() => useDeleted(), { wrapper })
    await waitFor(() => expect(result.current.deletedAt).toBeDefined())
    expect(typeof result.current.deletedAt).toBe('object')
  })

  it('exposes deleteProposal, restoreFromTrash, purgeFromTrash functions', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(DeletedProvider, null, children)
    const { result } = renderHook(() => useDeleted(), { wrapper })
    expect(typeof result.current.deleteProposal).toBe('function')
    expect(typeof result.current.restoreFromTrash).toBe('function')
    expect(typeof result.current.purgeFromTrash).toBe('function')
  })
})
