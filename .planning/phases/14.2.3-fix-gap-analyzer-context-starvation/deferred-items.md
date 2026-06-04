# Deferred Items — Phase 14.2.3

Out-of-scope discoveries logged during execution (not fixed here per SCOPE BOUNDARY).

## From Plan 03 execution (2026-06-04)

### 3 pre-existing test failures in `src/hooks/__tests__/useGapAnalysisTrigger.spec.ts`

- **Discovered during:** Task 1 verification (`npm run test:run`).
- **Status:** Pre-existing. Confirmed by stashing Plan 03's edits (`workspace.ts` + `SectionEditorBlock.tsx`) and re-running the spec in isolation — the 3 failures persist on the baseline, proving they are NOT caused by Plan 03's changes.
- **Root cause:** Uncommitted in-progress modifications to `src/hooks/useGapAnalysisTrigger.ts` (the client mount hash-gate, Decision 3). One failing assertion is at `useGapAnalysisTrigger.spec.ts:282` (`expect(mockState.invokeSpy).not.toHaveBeenCalled()`) — the mount-gate read/skip behavior is mid-implementation.
- **Scope:** `useGapAnalysisTrigger.ts` is explicitly OUT OF SCOPE for Plan 03 (scope_guard: "Do NOT touch ... the client trigger hook — those are Plans 01 and 02"). These belong to **Plan 02**.
- **Action:** NOT fixed here. To be resolved when Plan 02 (migration + client hash gate) is completed/committed.
