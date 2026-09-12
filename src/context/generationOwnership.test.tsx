// Ownership-signal coverage for the SHARED useProposalGeneration instance.
//
// GenerationProvider decides who owns the one hook instance. It used to decide from
// `state.isGenerating`, which is the WRONG signal: generateAll and resumeGeneration set
// their synchronous re-entrancy ref before their first await, but only dispatch
// START_GENERATION / RESUME_GENERATION after two awaited round-trips (the assumptions
// fetch inside buildEnrichedContext, then the sections select). For the whole of that
// window the loop is genuinely live and the reducer still says "idle".
//
// A claim granted inside that window hands the binding to another proposal while the
// loop keeps running against it — which is how the already-fixed cross-proposal defects
// come back through a different door (a zero-row proposal B skips its hydration RESET on
// isGeneratingRef and repaints A's sections; the provider then misattributes the run to
// B, so returning to A refuses A's own claim).
//
// The window is opened here deliberately, by leaving the enriched-context fetch
// unresolved, because it cannot be reached by driving the UI — it is bounded only by two
// network round-trips.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'

// Shared with the vi.mock factory below, which is hoisted above the imports. Every
// Supabase query the hook issues parks here and is never resolved, so the test controls
// exactly how long the two-await window stays open.
const { pendingQueries } = vi.hoisted(() => ({
  pendingQueries: [] as string[],
}))

vi.mock('../lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      update: vi.fn(() => builder),
      single: vi.fn(() => builder),
      // Thenable, never settled: awaiting (or .then-ing) any chain parks forever.
      then: (onFulfilled: unknown) => {
        pendingQueries.push(table)
        return new Promise(() => {}).then(onFulfilled as never)
      },
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
      from: vi.fn((table: string) => makeBuilder(table)),
      channel: vi.fn(() => makeChannel()),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn() },
    },
  }
})

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ session: null, profile: null }),
}))

import { GenerationProvider, useGeneration } from './GenerationContext'

type Ctx = ReturnType<typeof useGeneration>

function Probe({ onRender }: { onRender: (ctx: Ctx) => void }) {
  onRender(useGeneration())
  return null
}

/** Minimal stand-in: the loop parks on its first await, long before this is read. */
const proposalContext = {
  studyInfo: { therapeuticArea: 'Oncology', studyPhase: 'Phase II', countries: [], indication: 'NSCLC' },
  assumptions: [],
} as never

describe('GenerationProvider ownership signal', () => {
  beforeEach(() => {
    pendingQueries.length = 0
  })

  it('refuses another proposal inside the two-await window before state.isGenerating flips', async () => {
    let ctx!: Ctx
    const tree = (
      <GenerationProvider>
        <Probe onRender={c => { ctx = c }} />
      </GenerationProvider>
    )
    const view = render(tree)

    let claimedA = false
    act(() => { claimedA = ctx.claimGeneration('proposal-A') })
    expect(claimedA).toBe(true)
    expect(ctx.activeProposalId).toBe('proposal-A')

    // Start the loop. generateAll sets its synchronous guard and then parks on the
    // assumptions fetch inside buildEnrichedContext, which the mock never resolves — so
    // the two-await window stays open for the rest of the test.
    await act(async () => {
      void ctx.generation.generateAll(proposalContext)
      // Let the microtask chain reach the parked query, so the window is demonstrably
      // open rather than merely assumed.
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(pendingQueries).toContain('proposal_assumptions')

    // The window is genuinely open: the reducer has not been told yet.
    expect(ctx.generation.state.isGenerating).toBe(false)

    // The claim must still be refused — A's loop owns the instance.
    let claimedB = true
    act(() => { claimedB = ctx.claimGeneration('proposal-B') })
    expect(claimedB).toBe(false)
    expect(ctx.activeProposalId).toBe('proposal-A')

    // And the signal consumers read must already name A, not null. A fresh element is
    // required: React bails out of re-rendering a referentially identical one.
    act(() => {
      view.rerender(
        <GenerationProvider>
          <Probe onRender={c => { ctx = c }} />
        </GenerationProvider>
      )
    })
    expect(ctx.generatingProposalId).toBe('proposal-A')
  })

  it('still grants a claim to the same proposal, and to any proposal once no loop is running', () => {
    let ctx!: Ctx
    const tree = (
      <GenerationProvider>
        <Probe onRender={c => { ctx = c }} />
      </GenerationProvider>
    )
    render(tree)

    // Nothing running: the single-proposal path is untouched.
    let claimed = false
    act(() => { claimed = ctx.claimGeneration('proposal-A') })
    expect(claimed).toBe(true)
    act(() => { claimed = ctx.claimGeneration('proposal-B') })
    expect(claimed).toBe(true)
    expect(ctx.activeProposalId).toBe('proposal-B')
    expect(ctx.generatingProposalId).toBeNull()

    // Running: a re-claim by the owner is still granted (ProposalDetail's claim effect
    // re-runs whenever generatingProposalId changes and must stay a no-op).
    act(() => { void ctx.generation.generateAll(proposalContext) })
    act(() => { claimed = ctx.claimGeneration('proposal-B') })
    expect(claimed).toBe(true)
    expect(ctx.activeProposalId).toBe('proposal-B')
  })
})
