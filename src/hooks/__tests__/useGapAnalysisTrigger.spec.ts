// src/hooks/__tests__/useGapAnalysisTrigger.spec.ts
//
// Coverage for useGapAnalysisTrigger (phase 14.2.1 + 14.2.3 contract update):
//   - Always-fire on mount: the hook ALWAYS attempts analysis on mount; the old
//     D-35 "only when no chat_sessions row" suppression was removed (ac7d8ee).
//   - D-3 persisted-hash gate (Plan 02): on mount the hook reads the persisted
//     chat_sessions.pending_actions_content_hash and computes the current
//     whole-proposal hash via computeHash; it SKIPS the invoke only when they are
//     EQUAL. A null / absent / mismatched persisted hash ⇒ it runs.
//   - D-30 debounce: rapid Realtime events coalesce into one invoke after 3000ms.
//   - Content-hash skip: identical content suppresses duplicate invokes.
//   - 429 silence: cooldown response is swallowed without console.error.
//   - Unmount cleanup: removeChannel called, debounced timer does not fire.
//   - proposalId change: hash resets and the mount check runs for the new proposal.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

// ── Module-level mock state shared between tests via the vi.mock factory ──────
// We control responses per-test by mutating these handles.

type Handler = (payload: { new: Record<string, unknown> }) => void

const mockState = {
  proposalSectionsRows: [] as Array<{ section_key: string; name: string; content: string }>,
  // The persisted chat_sessions row. Carries pending_actions_content_hash AND
  // pending_actions so the mount D-3 gate can be exercised. `null` ⇒ no row ⇒ always
  // runs. A matching hash skips ONLY when pending_actions is non-empty (cache-trap fix).
  chatSessionsRow: null as
    | {
        pending_actions_content_hash: string | null
        pending_actions?: unknown[] | null
        resolved_items?: unknown[] | null
        // Read by scheduleCooldownRetry() to size the post-429 wakeup.
        pending_actions_generated_at?: string | null
      }
    | null,
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
    // The hook selects chat_sessions.pending_actions_content_hash via .maybeSingle().
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
// computeHash is exported so the test can seed a matching persisted hash to
// exercise the D-3 mount gate deterministically.
import { useGapAnalysisTrigger, computeHash } from '../useGapAnalysisTrigger'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Map proposal_sections rows into the SectionSummary shape the hook hashes/sends.
function toSummaries(
  rows: Array<{ section_key: string; name: string; content: string }>
) {
  return rows.map((r) => ({ key: r.section_key, title: r.name, content: r.content }))
}

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
  // Drain any pending microtasks (e.g. an in-flight mount IIFE whose
  // computeHash → invoke chain has not settled yet). Doing this under
  // real timers ensures Promise.resolve actually advances.
  vi.useRealTimers()
  for (let i = 0; i < 50; i++) await Promise.resolve()
  vi.clearAllMocks()
})

/**
 * Flush microtasks so awaited Supabase mock promises resolve before assertions.
 *
 * The hook chains: fetchSummaries → computeHash (subtle.digest) → maybeSingle
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
  it('fires analyze-proposal-gaps once on mount when no chat_sessions row exists', async () => {
    mockState.chatSessionsRow = null
    mockState.proposalSectionsRows = [
      { section_key: 'intro', name: 'Intro', content: 'Intro text' },
      { section_key: 'methods', name: 'Methods', content: 'Methods text' },
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
      { key: 'intro', title: 'Intro', content: 'Intro text' },
      { key: 'methods', title: 'Methods', content: 'Methods text' },
    ])
    expect(body.run_id).toMatch(UUID_RE)
  })

  it('fires on mount when a chat_sessions row exists but its stored content hash does NOT match', async () => {
    // Row exists but its persisted hash is stale/absent ⇒ mount must run.
    mockState.chatSessionsRow = { pending_actions_content_hash: 'stale-non-matching-hash' }
    mockState.proposalSectionsRows = [
      { section_key: 'intro', name: 'Intro', content: 'Intro text' },
    ]

    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)
    const [name] = mockState.invokeSpy.mock.calls[0]
    expect(name).toBe('analyze-proposal-gaps')
  })

  it('skips the mount invoke when the persisted content hash matches the current content', async () => {
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'Intro text' }]
    mockState.proposalSectionsRows = rows
    // Seed the persisted hash to exactly the current whole-proposal hash ⇒ D-3 gate skips.
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [{ id: 'cached' }], // non-empty cache ⇒ matching hash still skips
    }

    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).not.toHaveBeenCalled()
  })

  it('re-runs on mount when the hash matches but pending_actions is EMPTY (cache-trap fix)', async () => {
    // The 14.2.3 cache trap: a prior run wrote pending_actions=[] alongside a hash that
    // matches the CURRENT content. The mount gate must NOT treat an empty cache as a valid
    // skip — it must re-run so the queue can re-populate, instead of rendering empty forever
    // (the "suggestions disappear and never come back" bug). Hash match + empty ⇒ RUN.
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'Intro text' }]
    mockState.proposalSectionsRows = rows
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [], // empty cache — must NOT count as a valid skip
    }

    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)
  })

  it('re-runs on mount when hash matches and pending_actions is non-empty but ALL findings are dismissed (visible-empty trap)', async () => {
    // 14.2.3 visible-empty trap (root cause of "dismiss everything → reopen → stuck empty"):
    // onDismiss writes resolved_items but NEVER prunes chat_sessions.pending_actions, so the
    // stored array stays non-empty even when every finding has been dismissed. The mount gate
    // must measure the VISIBLE set (cached minus dismissed resolved_items), not the raw array —
    // otherwise it skips re-analysis forever and the queue can never re-populate.
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'Intro text' }]
    mockState.proposalSectionsRows = rows
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [
        { id: 'a1', type: 'gap', section_key: 'intro', title: 'Intro — placeholder unfilled' },
      ],
      resolved_items: [
        {
          originating_action_id: 'a1',
          section_key: 'intro',
          finding_type: 'gap',
          title: 'Intro — placeholder unfilled',
          user_action: 'dismissed',
          applied_changes: '',
          section_content_hash_at_action: 'h',
          timestamp: '2026-06-05T00:00:00.000Z',
        },
      ],
    }

    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)
  })

  it('still SKIPS on mount when hash matches and a cached finding remains visible (non-dismissed resolved item must not over-trigger)', async () => {
    // Guard against the visible-empty fix over-firing: a FIXED resolved item must NOT hide its
    // section's cached finding (dismissed-only suppression), so the finding stays visible and the
    // gate correctly skips. Exactly one cached finding, one matching FIXED resolved item ⇒ visible 1 ⇒ skip.
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'Intro text' }]
    mockState.proposalSectionsRows = rows
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [
        { id: 'b1', type: 'gap', section_key: 'intro', title: 'Intro — placeholder unfilled' },
      ],
      resolved_items: [
        {
          originating_action_id: 'b1',
          section_key: 'intro',
          finding_type: 'gap',
          title: 'Intro — placeholder unfilled',
          user_action: 'fixed',
          applied_changes: 'Filled it',
          section_content_hash_at_action: 'h',
          timestamp: '2026-06-05T00:00:00.000Z',
        },
      ],
    }

    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await flushAsync()
    })

    expect(mockState.invokeSpy).not.toHaveBeenCalled()
  })

  it('coalesces rapid Realtime UPDATE events into one invoke after 3000ms (debounce)', async () => {
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'A' }]
    mockState.proposalSectionsRows = rows
    // Seed a matching persisted hash so the mount invoke is correctly skipped and
    // this test stays focused on Realtime-debounce behavior.
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [{ id: 'cached' }], // non-empty cache ⇒ matching hash still skips
    }

    vi.useFakeTimers()
    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    // Flush the mount effect (the persisted-hash gate makes it a no-op here).
    await act(async () => {
      await advanceAndFlush(0)
    })
    expect(mockState.invokeSpy).not.toHaveBeenCalled()
    expect(mockState.capturedRealtimeHandler).not.toBeNull()

    // Change content so the Realtime run differs from the mount-seeded in-memory
    // hash and actually invokes (otherwise the in-memory hash skip suppresses it).
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'B' }]

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
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'Stable content' }]
    mockState.proposalSectionsRows = rows
    // Matching persisted hash ⇒ mount no-op; isolates the in-memory Realtime hash skip.
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [{ id: 'cached' }], // non-empty cache ⇒ matching hash still skips
    }

    vi.useFakeTimers()
    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))

    await act(async () => {
      await advanceAndFlush(0)
    })
    expect(mockState.invokeSpy).not.toHaveBeenCalled()

    // Change content from the mount-seeded value so the first Realtime run is not
    // suppressed by the in-memory hash seeded by the mount gate.
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'Changed content' }]

    // First Realtime UPDATE → debounce → invoke (in-memory hash gets stored).
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
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'NEW content' }]
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)
  })

  it('treats HTTP 429 cooldown as expected silence (no console.error)', async () => {
    mockState.chatSessionsRow = null
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'A' }]
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
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'A' }]
    mockState.proposalSectionsRows = rows
    // Matching persisted hash ⇒ mount no-op; isolates the unmount/debounce behavior.
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [{ id: 'cached' }], // non-empty cache ⇒ matching hash still skips
    }

    vi.useFakeTimers()
    const { unmount } = renderHook(() =>
      useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' })
    )

    // Drain the mount effect; persisted hash matches so this is a no-op.
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

  it('runs the mount check again when proposalId changes', async () => {
    mockState.chatSessionsRow = null
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'A' }]

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

    // Switch to a different proposal — the mount check fires again.
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'B' }]
    rerender({ pid: 'p2' })

    await act(async () => {
      await flushAsync()
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)
    expect(
      (mockState.invokeSpy.mock.calls[1][1] as { body: { proposal_id: string } }).body.proposal_id
    ).toBe('p2')
  })

  it('arms one cooldown retry after a 429 that fires once the window expires', async () => {
    // Cooldown-decouple: a 429 means the server's 30s per-proposal window rejected
    // this run. The hook arms ONE self-retry sized off pending_actions_generated_at
    // so the user's latest edit still gets analyzed without touching the doc again.
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'A' }]
    mockState.proposalSectionsRows = rows
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [{ id: 'cached' }], // matching hash + non-empty ⇒ mount skips
      pending_actions_generated_at: new Date(0).toISOString(), // last run at t=0
    }
    mockState.invokeResult = {
      data: null,
      error: { context: { status: 429 }, message: 'Edge Function returned a non-2xx status code' },
    }

    vi.useFakeTimers()
    vi.setSystemTime(0)
    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))
    await act(async () => {
      await advanceAndFlush(0)
    })
    expect(mockState.invokeSpy).not.toHaveBeenCalled() // mount skipped (hash match)

    // Edit → Realtime → debounced run gets the 429 and arms the retry.
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'B' }]
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)

    // Window still open (last run t=0, now ~3s of 30s) ⇒ retry has NOT fired yet.
    await act(async () => {
      await advanceAndFlush(1000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)

    // Window reopens; advance past remaining cooldown + buffer ⇒ the retry fires once.
    mockState.invokeResult = { data: null, error: null }
    await act(async () => {
      await advanceAndFlush(30_000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)
    // The retry force-runs against the LATEST content (re-fetched, not the stale run).
    const retryBody = (
      mockState.invokeSpy.mock.calls[1][1] as { body: { sections: Array<{ content: string }> } }
    ).body
    expect(retryBody.sections[0].content).toBe('B')
  })

  it('cancels the pending cooldown retry when newer content arrives (supersession)', async () => {
    // A newer edit supersedes the armed retry — the new debounced run covers the
    // latest state, so the stale retry must not also fire (no double-analysis).
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'A' }]
    mockState.proposalSectionsRows = rows
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [{ id: 'cached' }],
      pending_actions_generated_at: new Date(0).toISOString(),
    }
    mockState.invokeResult = {
      data: null,
      error: { context: { status: 429 }, message: 'cooldown' },
    }

    vi.useFakeTimers()
    vi.setSystemTime(0)
    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))
    await act(async () => {
      await advanceAndFlush(0)
    })

    // First edit → 429 → retry armed.
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'B' }]
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1)

    // Newer edit before the window expires → clearRetryTimer cancels the armed retry.
    // This run succeeds, so it does not arm a fresh retry of its own.
    mockState.invokeResult = { data: null, error: null }
    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'C' }]
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)

    // Advance well past where the ORIGINAL retry would have fired. If it were not
    // cancelled it would invoke a 3rd time; staying at 2 proves supersession.
    await act(async () => {
      await advanceAndFlush(60_000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)
  })

  it('does not re-arm after the retry itself gets a 429 (no retry loop)', async () => {
    // The retry runs with isRetry:true; a second 429 must NOT schedule another retry,
    // or a perpetually-throttled proposal would invoke forever.
    const rows = [{ section_key: 'intro', name: 'Intro', content: 'A' }]
    mockState.proposalSectionsRows = rows
    mockState.chatSessionsRow = {
      pending_actions_content_hash: await computeHash(toSummaries(rows)),
      pending_actions: [{ id: 'cached' }],
      pending_actions_generated_at: new Date(0).toISOString(),
    }
    // Every invoke 429s — including the retry.
    mockState.invokeResult = {
      data: null,
      error: { context: { status: 429 }, message: 'cooldown' },
    }

    vi.useFakeTimers()
    vi.setSystemTime(0)
    renderHook(() => useGapAnalysisTrigger({ proposalId: 'p1', userId: 'u1' }))
    await act(async () => {
      await advanceAndFlush(0)
    })

    mockState.proposalSectionsRows = [{ section_key: 'intro', name: 'Intro', content: 'B' }]
    mockState.capturedRealtimeHandler!({ new: {} })
    await act(async () => {
      await advanceAndFlush(3000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(1) // the 429'd run

    // Window expires → the single retry fires (and also 429s) ...
    await act(async () => {
      await advanceAndFlush(30_000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)

    // ... but isRetry runs never re-arm: no third invoke no matter how long we wait.
    await act(async () => {
      await advanceAndFlush(120_000)
    })
    expect(mockState.invokeSpy).toHaveBeenCalledTimes(2)
  })
})
