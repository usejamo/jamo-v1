# Deferred Items — Phase 14.4

## From Plan 14.4-02

- **`src/hooks/__tests__/useGapAnalysisTrigger.spec.ts`** — 2 pre-existing failures found during `npx vitest run` verification:
  - `skips invocation when content hash is unchanged (content-hash skip)` — expected invokeSpy called 1 time, got 0
  - `treats HTTP 429 cooldown as expected silence (no console.error)` — expected invokeSpy called 1 time, got 2
  - Out of scope: this plan touched only `supabase/functions/chat-with-jamo/{index.ts,context.ts,tools/substitute-placeholders.ts}` (edge function files). `useGapAnalysisTrigger` is an unrelated client hook from Phase 14.2.1. Not fixed per scope boundary rule.
