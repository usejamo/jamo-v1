// ============================================================================
// PURE FINDING VALIDATION + SESSION-WRITE PLANNING — extracted from index.ts so
// it can be imported by Vitest (validation.test.ts) without pulling in the
// Deno-only `npm:` specifiers (Anthropic SDK, supabase-js, zod) that Node/Vite
// cannot resolve. index.ts imports these and the handler calls them directly —
// no divergent copy.
//
// Root cause these close (2026-07-27, see
// docs/handoffs/2026-07-27-chat-suggestion-bugs-rootcause.md):
// `analyze-proposal-gaps` could not distinguish "analysis found nothing" from
// "analysis failed", and persisted BOTH as `pending_actions: []`. Realtime
// pushed the empty array to every open AIChatPanel (AIChatPanel.tsx:376) and the
// suggestions queue blanked until the next successful run repopulated it.
// Confirmed in prod `_gap_debug`: 3 runs (2026-07-22/24/27) recorded
// validated_count = -1 (whole-array Zod failure) → final_count = 0, each
// sandwiched between healthy runs on the same proposal.
// ============================================================================

/** Validates one finding, returning the parsed value or null. Injected so this
 *  module stays free of the `npm:zod` specifier — index.ts passes a closure over
 *  the real PendingActionSchema, so tests and production share these semantics
 *  without duplicating the schema. */
export type ValidateOne<T> = (item: unknown) => T | null

export interface PartitionResult<T> {
  valid: T[]
  /** Count of items that failed validation — for logging, never user-facing. */
  rejected: number
}

/**
 * Per-item validation, replacing the whole-array `z.array(Schema).safeParse(raw)`.
 *
 * All-or-nothing array validation is what produced the blank queue: a single
 * malformed finding (the offending field sat past the 8000-char `_gap_debug`
 * truncation, so it was never captured) discarded all ~25 valid siblings and the
 * run persisted `[]`. Keeping the good findings and dropping only the bad one
 * makes a total failure vanishingly rare, and `planSessionWrite` below makes the
 * remaining cases harmless.
 *
 * A non-array `raw` is a hard failure, NOT an empty result — callers must treat
 * `null` as "analysis failed" so it is never persisted as "no findings".
 */
export function partitionFindings<T>(
  raw: unknown,
  validateOne: ValidateOne<T>,
): PartitionResult<T> | null {
  if (!Array.isArray(raw)) return null
  const valid: T[] = []
  let rejected = 0
  for (const item of raw) {
    const parsed = validateOne(item)
    if (parsed === null) rejected++
    else valid.push(parsed)
  }
  return { valid, rejected }
}

/** Outcome of the Haiku call + parse + validation pipeline. */
export type AnalysisOutcome<T> =
  | { status: 'ok'; findings: T[] }
  | { status: 'failed'; reason: string }

/**
 * What to write to `chat_sessions` for a given outcome.
 *  - `full`          — write pending_actions + content hash + cooldown clock.
 *  - `cooldown-only` — analysis FAILED: leave pending_actions untouched so the
 *                      user's existing queue survives, but still advance
 *                      `pending_actions_generated_at` so the 30s cooldown keeps
 *                      throttling retries.
 *  - `skip`          — analysis failed and no session row exists yet; a
 *                      cooldown-only upsert would create a row with a null
 *                      pending_actions, so write nothing at all.
 */
export type SessionWritePlan = 'full' | 'cooldown-only' | 'skip'

export function planSessionWrite<T>(
  outcome: AnalysisOutcome<T>,
  sessionExists: boolean,
): SessionWritePlan {
  if (outcome.status === 'ok') return 'full'
  return sessionExists ? 'cooldown-only' : 'skip'
}

/**
 * D-3 desync guard, unchanged in spirit: never cache an EMPTY result's hash, so
 * the next mount re-runs instead of the empty becoming a permanent cached answer.
 * Only ever called on the `full` path — a failed run writes no hash at all.
 */
export function contentHashToPersist(
  findingCount: number,
  contentHash: string | null | undefined,
): string | null {
  return findingCount > 0 ? (contentHash ?? null) : null
}
