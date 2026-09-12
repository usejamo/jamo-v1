// Hydration fetch-race coverage for the SHARED useProposalGeneration instance.
//
// Since GenerationProvider hoisted this hook above the routes, one reducer serves
// every proposal. Navigating A -> B changes proposalId with both hydration queries
// still in flight, and the effect has no cleanup — so whichever response lands last
// wins, and nothing re-fetches afterwards. Without a sequence guard, A's late
// response puts A's sections into the state B is reading, persistently.
//
// This bug class has produced three separate defects and had no automated coverage.
// These tests drive the real hook through renderHook with manually-resolved
// deferreds so the resolution ORDER is under the test's control — the one thing a
// source assertion cannot express.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Shared with the vi.mock factory below, which is hoisted above the imports.
const { pendingHydrations } = vi.hoisted(() => ({
  pendingHydrations: [] as Array<{
    proposalId: string
    resolve: (value: { data: unknown }) => void
  }>,
}))

// The hydration effect awaits `from().select().eq().order()`. Each call gets its own
// deferred, tagged with the proposal id seen by `.eq('proposal_id', <id>)`, so a test
// can resolve A's and B's queries in any order it likes.
vi.mock('../lib/supabase', () => {
  const makeBuilder = () => {
    let proposalId = ''
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn((_column: string, value: string) => {
        proposalId = value
        return builder
      }),
      order: vi.fn(
        () =>
          new Promise(resolve => {
            pendingHydrations.push({
              proposalId,
              resolve: resolve as (value: { data: unknown }) => void,
            })
          })
      ),
    }
    return builder
  }
  const makeChannel = () => {
    const channel: Record<string, unknown> = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    }
    return channel
  }
  return {
    supabase: {
      from: vi.fn(() => makeBuilder()),
      channel: vi.fn(() => makeChannel()),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn() },
    },
  }
})

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: null, profile: null }),
}))

import { useProposalGeneration } from './useProposalGeneration'

const sectionRow = (id: string, label: string) => ({
  id,
  content: `<p>${label}</p>`,
  status: 'complete',
  name: `${label} section`,
  position: 1,
  role: null,
  section_key: `${label}_section`,
})

/** Pull the in-flight hydration for one proposal, so order is explicit at the call site. */
function takeHydration(proposalId: string) {
  const index = pendingHydrations.findIndex(p => p.proposalId === proposalId)
  expect(
    index,
    `expected an in-flight hydration for proposal ${proposalId}`
  ).toBeGreaterThanOrEqual(0)
  return pendingHydrations.splice(index, 1)[0]
}

/** Mount bound to A, switch to B, and hand back both queries still in flight. */
async function mountAndSwitch() {
  const view = renderHook((proposalId: string) => useProposalGeneration(proposalId), {
    initialProps: 'proposal-A',
  })
  await waitFor(() => expect(pendingHydrations).toHaveLength(1))

  view.rerender('proposal-B')
  await waitFor(() => expect(pendingHydrations).toHaveLength(2))

  return {
    result: view.result,
    a: takeHydration('proposal-A'),
    b: takeHydration('proposal-B'),
  }
}

describe('hydration fetch race across a proposal switch', () => {
  beforeEach(() => {
    pendingHydrations.length = 0
  })

  it("drops a superseded response so the previous proposal's sections never land", async () => {
    const { result, a, b } = await mountAndSwitch()

    // B (current) resolves first; A (superseded) resolves LAST and must be ignored.
    await act(async () => {
      b.resolve({ data: [sectionRow('b-1', 'B')] })
    })
    await act(async () => {
      a.resolve({ data: [sectionRow('a-1', 'A'), sectionRow('a-2', 'A')] })
    })

    expect(result.current.sortedSections.map(s => s.id)).toEqual(['b-1'])
    expect(result.current.state.totalCount).toBe(1)
  })

  it("drops a superseded EMPTY response instead of resetting the current proposal's sections", async () => {
    const { result, a, b } = await mountAndSwitch()

    // The trap the sequence check has to sit ahead of: a stale zero-row response
    // reaching the RESET branch would erase what B just hydrated.
    await act(async () => {
      b.resolve({ data: [sectionRow('b-1', 'B')] })
    })
    await act(async () => {
      a.resolve({ data: [] })
    })

    expect(result.current.sortedSections.map(s => s.id)).toEqual(['b-1'])
    expect(result.current.state.totalCount).toBe(1)
  })
})
