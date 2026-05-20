// src/hooks/__tests__/useGapAnalysisTrigger.spec.ts
//
// Coverage for useGapAnalysisTrigger (phase 14.2.1, Plan 01):
//   - D-35 initial population: fires once when no chat_sessions row exists
//   - D-35 skip: does NOT fire when a chat_sessions row already exists
//   - D-30 debounce: rapid Realtime events coalesce into one invoke
//   - Content-hash skip: identical content suppresses duplicate invokes
//   - 429 silence: cooldown response is swallowed without console.error
//   - Unmount cleanup: removeChannel called, debounced timer does not fire
//   - proposalId change: hash resets and initial check runs for the new proposal

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

// ── Module-level mock state shared between tests via the vi.mock factory ──────
// We control responses per-test by mutating these handles.

type Handler = (payload: { new: Record<string, unknown> }) => void

const mockState = {
  proposalSectionsRows: [] as Array<{ section_key: string; content: string }>,
  chatSessionsRow: null as { id: string } | null,
  invokeResult: { data: null, error: null } as { data: unknown; error: unknown },
  capturedRealtimeHandler: null as Handler | null,
  invokeSpy: vi.fn(),
  removeChannelSpy: vi.fn(),
  subscribeSpy: vi.fn(),
}

function resetMockState() {
  mockState.proposalSectionsRows = []
  mockState.chatSessionsRow = null
  mockState.invokeResult = { data: null, error: null }
  mockState.capturedRealtimeHandler = null
  mockState.invokeSpy = vi.fn(async () => mockState.invokeResult)
  mockState.removeChannelSpy = vi.fn()
  mockState.subscribeSpy = vi.fn(function (this: unknown) {
    return this
  })
}

vi.mock('../../lib/supabase', () => {
  // Use plain functions (no vi.fn() inside the factory) so vi.clearAllMocks()
  // cannot wipe these implementations between tests. Per-test spies live on
  // `mockState` and are re-armed by `resetMockState()` in beforeEach.
  function makeFromBuilder(table: string) {
    const builder: Record<string, unknown> = { _table: table }
    builder.select = () => builder
    builder.eq = () => builder
    builder.order = () => Promise.resolve({ data: mockState.proposalSectionsRows, error: null })
    builder.maybeSingle = async () => ({ data: mockState.chatSessionsRow, error: null })
    return builder
  }

  const supabase = {
    from: (table: string) => makeFromBuilder(table),
    channel: (_name: string) => {
      const ch: Record<string, unknown> = {}
      ch.on = (_evt: string, _opts: unknown, handler: Handler) => {
        mockState.capturedRealtimeHandler = handler
        return ch
      }
      ch.subscribe = () => {
        mockState.subscribeSpy()
        return ch
      }
      return ch
    },
    removeChannel: (ch: unknown) => {
      mockState.removeChannelSpy(ch)
    },
    functions: {
      invoke: async (name: string, opts: { body: unknown }) => {
        return mockState.invokeSpy(name, opts)
      },
    },
  }
  return { supabase }
})

// Imported AFTER vi.mock so the hook resolves the mocked supabase client.
import { useGapAnalysisTrigger } from '../useGapAnalysisTrigger'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// happy-dom provides crypto.subtle; if not, polyfill from node webcrypto.
beforeEach(async () => {
  resetMockState()
  if (!globalThis.crypto?.subtle) {
    const { webcrypto } = await import('node:crypto')
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    })
  }
})

afterEach(async () => {
  // Unmount any hooks rendered by this test so their effects do not bleed
  // into the next test's mockState.
  cleanup()
  // Drain any pending microtasks (e.g. an in-flight initial-population IIFE
  // whose computeHash → invoke chain has not settled yet). Doing this under
  // real timers ensures Promise.resolve actually advances.
  vi.useRealTimers()
  for (let i = 0; i < 50; i++) await Promise.resolve()
  vi.clearAllMocks()
})

/**
 * Flush microtasks so awaited Supabase mock promises resolve before assertions.
 *
 * The hook chains: maybeSingle → fetchSummaries → computeHash (subtle.digest)
 * → invoke. Each `await` is one microtask; we drain generously to be safe
 * across happy-dom + fake-timer interactions.
 */
async function flushAsync() {
  // Use both microtasks AND macrotasks because crypto.subtle.digest in
  // happy-dom resolves via a different scheduler than synchronous Promise.resolve.
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    for (let j = 0; j < 20; j++) await Promise.resolve()
  }
}

/**
 * Advance fake timers by `ms` AND drain microtasks in alternation so that
 * promise chains kicked off by the timer callback can fully resolve before
 * assertions run.
 */
async function advanceAndFlush(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  for (let i = 0; i < 50; i++) {
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
  }
}

describe('useGapAnalysisTrigger', () => {
  it('fires analyze-proposal-gaps once on mount when no chat_sessions row exists (D-35)', async () => {
    mockState.chatSessionsRow = null
    mockState.proposalSectionsRows = [
      { section_key: 'intro', content: 'Intro text' },
      { section_key: 'methods', content: 'Methods text' },
    ]

    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)
    const [name, opts] = mockState.invokeSpy.mock.calls[0]
    expect(name).toBe('analyze-proposal-gaps')
    const body = (opts as { body: { proposal_id: string; sections: unknown; run_id: string } }).body
    expect(body.proposal_id).toBe('p1')
    expect(body.sections).toEqual([
      { section_key: 'intro', content: 'Intro text' },
      { section_key: 'methods', content: 'Methods text' },
    ])
    expect(body.run_id).toMatch(UUID_RE)
  })

  it('does NOT fire analyze-proposal-gaps on mount when chat_sessions row exists (D-35 skip)', async () => {
    mockState.chatSessionsRow = { id: 'session-1' }
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'Intro' }]

    const { unmount } = renderHook(() =>
      useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' })
    )

    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('coalesces rapid Realtime UPDATE events into one invoke after 3000ms (debounce)', async () => {
    // Existing session so D-35 initial fire does NOT happen.
    mockState.chatSessionsRow = { id: 'session-1' }
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'A' }]

    vi.useFakeTimers()
    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    // Flush the initial-population effect (which should be a no-op here).
    await act(async () => {
      await advanceAndFlush(0)
    })
    expect(mockState.invokeSpy).not.toHaveBeenCalled()
    expect(mockState.capturedRealtimeHandler).not.toBeNull()

    // Fire 5 rapid Realtime events, each within the debounce window.
    for (let i = 0; i < 5; i++) {
      mockState.capturedRealtimeHandler!({ new: { proposal_id: 'p1' } })
      await act(async () => {
        await advanceAndFlush(100)
      })
    }
    // Still inside debounce — no invoke yet.
    expect(mockState.invokeSpy).not.toHaveBeenCalled()

    // Advance past the 3000ms debounce from the LAST event.
    await act(async () => {
      await advanceAndFlush(3000)
    })

    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)
  })

  it('skips invocation when content hash is unchanged (content-hash skip)', async () => {
    mockState.chatSessionsRow = { id: 'session-1' }
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'Stable content' }]

    vi.useFakeTimers()
    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await advanceAndFlush(0)
    })

    // First Realtime UPDATE → debounce → invoke (hash gets stored).
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)

    // Second Realtime UPDATE with IDENTICAL content → hash matches → skip.
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)

    // Third Realtime UPDATE with DIFFERENT content → hash differs → invoke.
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'NEW content' }]
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)
  })

  it('treats HTTP 429 cooldown as expected silence (no console.error)', async () => {
    mockState.chatSessionsRow = null
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'A' }]
    mockState.invokeResult = {
      data: null,
      error: { context: { status: 429 }, message: 'Edge Function returned a non-2xx status code' },
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))
    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('cleans up on unmount: removeChannel called, debounced timer does not fire', async () => {
    mockState.chatSessionsRow = { id: 'session-1' }
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'A' }]

    vi.useFakeTimers()
    const { unmount } = renderHook(() =>
      useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' })
    )

    // Drain the initial-population effect; chat_sessions row exists so this is a no-op.
    await act(async () => {
      await advanceAndFlush(0)
    })
    expect(mockState.invokeSpy).not.toHaveBeenCalled()

    // Queue a debounced run, then unmount before 3000ms elapses.
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(500)
    })
    expect(mockState.invokeSpy).not.toHaveBeenCalled()

    await act(async () => {
      unmount()
    })
    expect(mockState.removeChannelSpy).toHaveBeenCalledTimes(1)

    // Advance well past the original debounce; no invoke should fire.
    await act(async () => {
      await advanceAndFlush(10_000)
    })
    expect(mockState.invokeSpy).not.toHaveBeenCalled()
  })

  it('runs the initial-population check again when proposalId changes', async () => {
    mockState.chatSessionsRow = null
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'A' }]

    const { rerender } = renderHook(
      ({ pid }: { pid: string }) =>
        useGapAnalysisTrigger({ proposalId: pid, userId: 'u1' }),
      { initialProps: { pid: 'p1' } }
    )

    await act(async () => {
      await flushAsync()
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)
    expect(
      (mockState.invokeSpy.mock.calls[0][1] as { body: { proposal_id: string } }).body.proposal_id
    ).toBe('p1')

    // Switch to a different proposal — initial-population fires again.
    mockState.proposalSectionsRows = [{ section_key: 'intro', content: 'B' }]
    rerender({ pid: 'p2' })

    await act(async () => {
      await flushAsync()
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)
    expect(
      (mockState.invokeSpy.mock.calls[1][1] as { body: { proposal_id: string } }).body.proposal_id
    ).toBe('p2')
  })
})
