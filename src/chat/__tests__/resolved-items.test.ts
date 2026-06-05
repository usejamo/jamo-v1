import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { appendResolvedItem, rebuildFilterSet, identityKey } from '../resolved-items'
import type { ResolvedItem } from '../../types/chat'

function makeEntry(overrides?: Partial<ResolvedItem>): ResolvedItem {
  return {
    originating_action_id: 'act-1',
    section_key: 'executive_summary',
    finding_type: 'gap',
    title: 't',
    description: 'd',
    user_action: 'dismissed',
    applied_changes: '',
    section_content_hash_at_action: 'h',
    timestamp: '2026-05-28T00:00:00.000Z',
    acceptance_summary: { accepted: 0, rejected: 1, stale: 0 },
    ...overrides,
  }
}

function makeClient(rpcImpl: (...args: any[]) => Promise<{ error: any }>) {
  return { rpc: vi.fn(rpcImpl) } as any
}

describe('appendResolvedItem retry/backoff (D-25, D-26)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns after first successful RPC (no retry)', async () => {
    const client = makeClient(async () => ({ error: null }))
    const p = appendResolvedItem({
      proposalId: 'p',
      userId: 'u',
      orgId: 'o',
      entry: makeEntry(),
      client,
    })
    await p
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('retries up to 3 times then logs dropped after retries', async () => {
    const client = makeClient(async () => ({ error: { message: 'boom' } }))
    const promise = appendResolvedItem({
      proposalId: 'p',
      userId: 'u',
      orgId: 'o',
      entry: makeEntry(),
      client,
    })
    // I2 fix: one runAllTimersAsync() drains every queued setTimeout regardless of delay constants.
    await vi.runAllTimersAsync()
    await promise
    expect(client.rpc).toHaveBeenCalledTimes(3)
    // 3 RPC-error warns + 1 dropped-after-retries warn = 4
    expect((console.warn as any).mock.calls.length).toBe(4)
    const droppedCall = (console.warn as any).mock.calls.at(-1)
    expect(droppedCall[0]).toContain('dropped after retries')
    expect(droppedCall[1]).toMatchObject({
      proposal_id: 'p',
      user_id: 'u',
      action_id: 'act-1',
    })
  })

  it('structured warn fields on retry include attempt count', async () => {
    let calls = 0
    const client = makeClient(async () => {
      calls++
      return { error: { message: `err-${calls}` } }
    })
    const promise = appendResolvedItem({
      proposalId: 'p',
      userId: 'u',
      orgId: 'o',
      entry: makeEntry(),
      client,
    })
    await vi.runAllTimersAsync()
    await promise
    const errCall = (console.warn as any).mock.calls[0]
    expect(errCall[1]).toMatchObject({
      proposal_id: 'p',
      user_id: 'u',
      action_id: 'act-1',
      attempt: 1,
    })
  })

  it('treats thrown errors with retry semantics and logs structured fields', async () => {
    const client = makeClient(async () => {
      throw new Error('network down')
    })
    const promise = appendResolvedItem({
      proposalId: 'p',
      userId: 'u',
      orgId: 'o',
      entry: makeEntry(),
      client,
    })
    await vi.runAllTimersAsync()
    await promise
    expect(client.rpc).toHaveBeenCalledTimes(3)
    const firstWarn = (console.warn as any).mock.calls[0]
    expect(firstWarn[0]).toContain('threw')
    expect(firstWarn[1]).toMatchObject({
      proposal_id: 'p',
      attempt: 1,
      error: 'network down',
    })
    const droppedCall = (console.warn as any).mock.calls.at(-1)
    expect(droppedCall[0]).toContain('dropped after retries')
  })
})

// Phase 14.2.3 — rebuildFilterSet over-suppression fix.
// The client-side filter Set is a hard belt-and-suspenders guard that should ONLY
// hide findings the user explicitly DISMISSED. "Fixed" items must NOT seed the Set:
// a fixed section keeps evolving and Haiku (temperature 0) re-emits a same-titled
// finding for what REMAINS — blanket-hiding by identity wrongly suppressed those
// (the "DB had 5 findings but user saw 1" bug). Dedup of fixed items is the edge
// prompt's job ("describe what remains"), not the client's.
describe('rebuildFilterSet — dismissed-only suppression (14.2.3)', () => {
  function item(overrides?: Partial<ResolvedItem>): ResolvedItem {
    return {
      originating_action_id: 'act-1',
      section_key: 'budget',
      finding_type: 'gap',
      title: 'Budget — cost placeholder unfilled',
      description: 'd',
      user_action: 'dismissed',
      applied_changes: '',
      section_content_hash_at_action: 'h',
      timestamp: '2026-06-05T00:00:00.000Z',
      acceptance_summary: { accepted: 0, rejected: 1, stale: 0 },
      ...overrides,
    }
  }

  it('seeds both id: and ik: keys for a dismissed item', () => {
    const set = rebuildFilterSet([item({ user_action: 'dismissed' })])
    expect(set.has('id:act-1')).toBe(true)
    expect(
      set.has(
        `ik:${identityKey({ section_key: 'budget', finding_type: 'gap', title: 'Budget — cost placeholder unfilled' })}`,
      ),
    ).toBe(true)
  })

  it('does NOT seed any key for a fixed item', () => {
    const set = rebuildFilterSet([
      item({ originating_action_id: 'act-2', user_action: 'fixed', applied_changes: 'Added cost' }),
    ])
    expect(set.size).toBe(0)
  })

  it('keeps only dismissed keys when fixed and dismissed items are mixed', () => {
    const set = rebuildFilterSet([
      item({ originating_action_id: 'fix-1', user_action: 'fixed', section_key: 'scope', title: 'Scope — needs ISO citation' }),
      item({ originating_action_id: 'dis-1', user_action: 'dismissed', section_key: 'team', title: 'Team — bios thin' }),
    ])
    expect(set.has('id:fix-1')).toBe(false)
    expect(set.has('id:dis-1')).toBe(true)
    expect(set.has(`ik:${identityKey({ section_key: 'team', finding_type: 'gap', title: 'Team — bios thin' })}`)).toBe(true)
    expect(set.has(`ik:${identityKey({ section_key: 'scope', finding_type: 'gap', title: 'Scope — needs ISO citation' })}`)).toBe(false)
  })
})
