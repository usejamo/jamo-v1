// supabase/functions/analyze-proposal-gaps/__tests__/cooldown.test.ts
// 14.2.x cooldown decoupling (#1): isWithinCooldown keys the per-proposal cooldown
// off pending_actions_generated_at (last COMPLETED run) instead of last_updated
// (every chat write). These cases pin the three branches that matter: never-run
// (null) must NOT throttle, a run inside the window must throttle, and a run past
// the window must reopen. See index.ts isWithinCooldown.

import { describe, it, expect } from 'vitest'
import { isWithinCooldown } from '../index.ts'

const COOLDOWN_MS = 30_000
const NOW = Date.parse('2026-06-17T12:00:00.000Z')

describe('isWithinCooldown (per-proposal cooldown clock)', () => {
  it('returns false when there is no prior completed run (null/undefined)', () => {
    // No row / never analyzed ⇒ analysis is due, never throttled.
    expect(isWithinCooldown(null, NOW, COOLDOWN_MS)).toBe(false)
    expect(isWithinCooldown(undefined, NOW, COOLDOWN_MS)).toBe(false)
  })

  it('returns true when the last run is within the cooldown window', () => {
    const tenSecondsAgo = new Date(NOW - 10_000).toISOString()
    expect(isWithinCooldown(tenSecondsAgo, NOW, COOLDOWN_MS)).toBe(true)
  })

  it('returns false when the last run is older than the cooldown window', () => {
    const fortySecondsAgo = new Date(NOW - 40_000).toISOString()
    expect(isWithinCooldown(fortySecondsAgo, NOW, COOLDOWN_MS)).toBe(false)
  })

  it('treats exactly cooldownMs elapsed as expired (boundary reopens)', () => {
    // elapsed === cooldownMs ⇒ NOT strictly less than ⇒ window is open again.
    const exactlyAtBoundary = new Date(NOW - COOLDOWN_MS).toISOString()
    expect(isWithinCooldown(exactlyAtBoundary, NOW, COOLDOWN_MS)).toBe(false)
  })
})
