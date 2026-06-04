# Deferred Items — Phase 14.2.3

Out-of-scope discoveries logged during execution (not fixed here per SCOPE BOUNDARY).

## From Plan 03 execution (2026-06-04)

### 3 pre-existing test failures in `src/hooks/__tests__/useGapAnalysisTrigger.spec.ts`

- **Discovered during:** Task 1 verification (`npm run test:run`).
- **Status:** Pre-existing. Confirmed by stashing Plan 03's edits (`workspace.ts` + `SectionEditorBlock.tsx`) and re-running the spec in isolation — the 3 failures persist on the baseline, proving they are NOT caused by Plan 03's changes.
- **Root cause:** Uncommitted in-progress modifications to `src/hooks/useGapAnalysisTrigger.ts` (the client mount hash-gate, Decision 3). One failing assertion is at `useGapAnalysisTrigger.spec.ts:282` (`expect(mockState.invokeSpy).not.toHaveBeenCalled()`) — the mount-gate read/skip behavior is mid-implementation.
- **Scope:** `useGapAnalysisTrigger.ts` is explicitly OUT OF SCOPE for Plan 03 (scope_guard: "Do NOT touch ... the client trigger hook — those are Plans 01 and 02"). These belong to **Plan 02**.
- **Action:** NOT fixed here. To be resolved when Plan 02 (migration + client hash gate) is completed/committed.

## From Plan 02 execution (2026-06-04) — UPDATE on the 3 spec failures above

- **Status after Plan 02 implementation:** STILL failing, and now confirmed they are a spec-contract mismatch, not an implementation bug. Plan 02 stashed its `useGapAnalysisTrigger.ts` edits and re-ran the spec: identical 3 failures (4 pass / 3 fail) on the baseline, so Plan 02 did NOT introduce or worsen them.
- **Root cause (refined):** Commit `ac7d8ee` made the mount path ALWAYS fire (removing the old D-35 "skip when chat_sessions row exists" behavior). The spec still asserts the OLD contract (`useGapAnalysisTrigger.spec.ts:282` `expect(invokeSpy).not.toHaveBeenCalled()` for the row-exists case) and its mocks do not stub the new mount read of `chat_sessions.select('pending_actions_content_hash').maybeSingle()`.
- **Plan 02 verification used instead:** `tsc --noEmit` exit 0 for both modified files; manual UAT (Task 4) covers the runtime mount-gate behavior.
- **Follow-up owner:** A test-maintenance task must rewrite `useGapAnalysisTrigger.spec.ts` to the new always-fire + persisted-hash-gate contract (stub the mount `chat_sessions` select).
- **Other flaky/unrelated failures observed** (network/timeout-dependent, vary run-to-run, untouched by this phase): `DocumentList.test.tsx`, `resolved-items.test.ts`, `SectionEditorBlock.test.tsx`.
