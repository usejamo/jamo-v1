import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// STUB: will pass once ProposalsContext is migrated to Supabase in Plan 01-04
vi.mock('../../../lib/supabase', () => import('../../test/mocks/supabase'))

describe('proposals-context', () => {
  it.skip('exposes proposals array and loading state', () => {
    // Will be implemented in Plan 04 after ProposalsContext is migrated
    expect(true).toBe(true)
  })

  it.skip('createProposal calls supabase.from("proposals").insert()', () => {
    expect(true).toBe(true)
  })
})
