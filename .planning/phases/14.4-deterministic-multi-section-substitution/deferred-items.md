# Deferred Items — Phase 14.4

## Pre-existing failing tests (out of scope for 14.4-01)

`src/hooks/__tests__/useGapAnalysisTrigger.spec.ts` has 4 failing tests (timer/mock-call-count
assertions around Realtime debounce + 429 cooldown retry). These are unrelated to Plan 01's
files (`src/editor/placeholders/substitute.ts` and its two spec files) and predate this plan's
changes — no file under `src/hooks/` or `src/editor/plugins/` was touched. Not fixed per the
scope boundary rule (only auto-fix issues directly caused by the current task's changes).

Full-suite result at time of Plan 01 completion: 1 failed | 48 passed | 2 skipped (test files);
4 failed | 315 passed | 16 skipped (tests).
