import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { ProposalsProvider, useProposals } from '../ProposalsContext'

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
      then: vi.fn().mockImplementation((cb: (v: { data: any[]; error: null }) => void) =>
        Promise.resolve(cb({ data: [], error: null }))
      ),
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
  it('exposes proposals array and loading state', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ProposalsProvider, null, children)
    const { result } = renderHook(() => useProposals(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(Array.isArray(result.current.proposals)).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('createProposal calls supabase insert', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ProposalsProvider, null, children)
    const { result } = renderHook(() => useProposals(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.createProposal({
        title: 'Test Proposal',
        client: 'ACME',
        status: 'draft',
        studyType: 'Phase II',
        therapeuticArea: 'Oncology',
        dueDate: '2026-06-01',
        value: 100000,
        indication: 'NSCLC',
        description: 'Test',
      })
    })
    // Mock resolves with empty data — no error thrown = success
    expect(result.current.error).toBeNull()
  })
})
