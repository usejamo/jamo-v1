// Regression: the suggestions queue blanked, then repopulated minutes later.
//
// Root cause (docs/handoffs/2026-07-27-chat-suggestion-bugs-rootcause.md):
// analyze-proposal-gaps could not tell "analysis found nothing" from "analysis
// failed" and persisted BOTH as chat_sessions.pending_actions = []. Realtime
// pushed the empty array to every open AIChatPanel (AIChatPanel.tsx:376) and the
// queue went blank until the next successful run.
//
// Prod evidence (_gap_debug, project fuuvdcvbliijffogjnwg): validated_count = -1
// is the sentinel for a whole-array Zod failure — 3 occurrences, each between two
// healthy runs on the same proposal, e.g. 2026-07-27
//   23:15 validated=14 final=7  →  23:19 validated=-1 final=0  →  23:25 validated=15 final=5
//
// These tests pin the two invariants that close it:
//   1. one malformed finding must not discard its valid siblings
//   2. a failed analysis must never be written as an empty result

import { describe, it, expect } from 'vitest'
import {
  partitionFindings,
  planSessionWrite,
  contentHashToPersist,
  type AnalysisOutcome,
} from './validation.ts'

interface Finding { section_key: string; title: string }

/** Stands in for PendingActionSchema.safeParse — index.ts injects the real one. */
const validateOne = (item: unknown): Finding | null => {
  const o = item as Partial<Finding> & { description?: string }
  if (!o || typeof o !== 'object') return null
  if (typeof o.section_key !== 'string' || !o.section_key) return null
  if (typeof o.title !== 'string' || !o.title) return null
  // Mirrors the real schema's `description: z.string().min(1).max(500)` — the
  // most plausible field for Haiku to overrun on a verbose proposal.
  if (typeof o.description !== 'string' || o.description.length > 500) return null
  return { section_key: o.section_key, title: o.title }
}

const good = (n: number) => ({ section_key: `section-${n}`, title: `Finding ${n}`, description: 'ok' })

describe('partitionFindings — per-item validation', () => {
  it('keeps the valid findings when a single item is malformed', () => {
    // The exact production shape: 25 findings, one with an over-length description.
    const raw: unknown[] = [
      ...Array.from({ length: 12 }, (_, i) => good(i)),
      { section_key: 'section-overlong', title: 'Cover Letter', description: 'x'.repeat(501) },
      ...Array.from({ length: 12 }, (_, i) => good(i + 13)),
    ]

    const result = partitionFindings(raw, validateOne)

    expect(result).not.toBeNull()
    // Before the fix this was 0 — the whole array was discarded and persisted as [].
    expect(result!.valid).toHaveLength(24)
    expect(result!.rejected).toBe(1)
    expect(result!.valid.map(f => f.section_key)).not.toContain('section-overlong')
  })

  it('returns an empty-but-successful partition when the model genuinely finds nothing', () => {
    const result = partitionFindings([], validateOne)
    expect(result).not.toBeNull()
    expect(result!.valid).toHaveLength(0)
    expect(result!.rejected).toBe(0)
  })

  it('returns null (hard failure) for a non-array payload, never an empty result', () => {
    // Must not be mistaken for "no findings" — that is the bug being fixed.
    expect(partitionFindings(null, validateOne)).toBeNull()
    expect(partitionFindings({ error: 'nope' }, validateOne)).toBeNull()
    expect(partitionFindings('[]', validateOne)).toBeNull()
  })

  it('reports every reject when all items are malformed', () => {
    const raw = [{ bad: 1 }, { bad: 2 }, { bad: 3 }]
    const result = partitionFindings(raw, validateOne)
    expect(result!.valid).toHaveLength(0)
    expect(result!.rejected).toBe(3)
  })
})

describe('planSessionWrite — a failed analysis is never persisted as empty', () => {
  const ok: AnalysisOutcome<Finding> = { status: 'ok', findings: [good(1)] }
  const empty: AnalysisOutcome<Finding> = { status: 'ok', findings: [] }
  const failed: AnalysisOutcome<Finding> = { status: 'failed', reason: 'haiku threw' }

  it('writes the full row for a successful analysis', () => {
    expect(planSessionWrite(ok, true)).toBe('full')
  })

  it('writes the full row for a genuinely empty result (a clean proposal)', () => {
    // A real "no issues found" answer must still clear the queue.
    expect(planSessionWrite(empty, true)).toBe('full')
  })

  it('advances only the cooldown clock when the analysis failed', () => {
    // The whole fix: pending_actions is left alone so the user's queue survives.
    expect(planSessionWrite(failed, true)).toBe('cooldown-only')
  })

  it('writes nothing when the analysis failed and no session row exists yet', () => {
    // A cooldown-only upsert would create a row with a null pending_actions.
    expect(planSessionWrite(failed, false)).toBe('skip')
  })
})

describe('contentHashToPersist — never cache an empty result', () => {
  it('persists the hash when there are findings', () => {
    expect(contentHashToPersist(3, 'abc')).toBe('abc')
  })

  it('persists null for an empty result so the next mount re-runs', () => {
    expect(contentHashToPersist(0, 'abc')).toBeNull()
  })
})
