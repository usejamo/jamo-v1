# Deferred Items — Phase 14.4

## Pre-existing failing tests (out of scope for 14.4-01)

`src/hooks/__tests__/useGapAnalysisTrigger.spec.ts` has failing tests (timer/mock-call-count
assertions around Realtime debounce + 429 cooldown retry). These are unrelated to Plan 01's
files (`src/editor/placeholders/substitute.ts` and its two spec files) and predate this plan's
changes — no file under `src/hooks/` or `src/editor/plugins/` was touched. Not fixed per the
scope boundary rule (only auto-fix issues directly caused by the current task's changes).

Full-suite result at time of Plan 01 completion: 1 failed | 48 passed | 2 skipped (test files);
4 failed | 315 passed | 16 skipped (tests).

## From Plan 14.4-02

- **`src/hooks/__tests__/useGapAnalysisTrigger.spec.ts`** — pre-existing failures found during `npx vitest run` verification:
  - `skips invocation when content hash is unchanged (content-hash skip)` — expected invokeSpy called 1 time, got 0
  - `treats HTTP 429 cooldown as expected silence (no console.error)` — expected invokeSpy called 1 time, got 2
  - Out of scope: this plan touched only `supabase/functions/chat-with-jamo/{index.ts,context.ts,tools/substitute-placeholders.ts}` (edge function files). `useGapAnalysisTrigger` is an unrelated client hook from Phase 14.2.1. Not fixed per scope boundary rule.

## From Plan 14.4-04

- **`src/hooks/__tests__/useGapAnalysisTrigger.spec.ts`** and, intermittently, **`src/chat/__tests__/applied-changes.test.ts`** — both fail only under the full-suite parallel run (`npx vitest run`) and both pass 100% in isolation (`npx vitest run <file>`). Confirmed via repeated full-suite runs that the specific failing test names vary run-to-run (timer/mock-call-count assertions in the former; no assertion failures reproduced in isolation for the latter) — consistent with the pre-existing pool/timing flakiness documented in STATE.md (`vitest pool: forks + singleFork: true`, memory-constrained dev machine). Neither file was touched by this plan (`src/components/AIChatPanel.tsx`, `src/components/chat/BulkSubstitutionSummaryCard.tsx`, `src/types/chat.ts`). Not fixed per scope boundary rule.
