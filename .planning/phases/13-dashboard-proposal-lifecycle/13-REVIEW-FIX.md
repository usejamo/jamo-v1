---
phase: 13-dashboard-proposal-lifecycle
fixed_at: 2026-05-07T00:00:00Z
review_path: .planning/phases/13-dashboard-proposal-lifecycle/13-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-05-07
**Source review:** .planning/phases/13-dashboard-proposal-lifecycle/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: `permanentlyDelete` + `purgeFromTrash` called without error handling

**Files modified:** `src/pages/ProposalsList.tsx`
**Commit:** 0fdae88
**Applied fix:** Converted Delete Forever onClick to `async` handler wrapped in try/catch/finally. `permanentlyDelete` is now awaited; `purgeFromTrash` only runs on success. DB failure shows a "Delete failed" toast. `setPermanentDeleteTarget(null)` moved to `finally` so the modal always closes.

### WR-02: `'Duplicate'` action rendered but never handled

**Files modified:** `src/pages/ProposalsList.tsx`, `src/pages/Dashboard.tsx`
**Commit:** 0fdae88 (ProposalsList), 88d0de8 (Dashboard)
**Applied fix:** Removed `'Duplicate'` from the `rowActions` array in ProposalsList for both active and archived views, and removed it from the `['Edit', 'Duplicate', 'Archive']` map in the Dashboard Priority Focus action list. Added comment noting the feature is not yet implemented.

### WR-03: `formatDate('')` renders "Invalid Date" for proposals without due date

**Files modified:** `src/pages/ProposalsList.tsx`, `src/pages/Dashboard.tsx`
**Commit:** 0fdae88 (ProposalsList), 88d0de8 (Dashboard)
**Applied fix:** Added `if (!s) return '—'` guard at the top of `formatDate` in both files, matching the guard already present in `ProposalDetail.tsx`.

### WR-04: Auto-generate `useEffect` suppresses exhaustive-deps — stale-closure risk

**Files modified:** `src/pages/ProposalDetail.tsx`
**Commit:** b14d7e3
**Applied fix:** Converted `buildProposalInput` from a plain component-scoped function to a `useCallback` with `[proposal]` as its dependency array. Removed the `// eslint-disable-next-line react-hooks/exhaustive-deps` suppression from the auto-generate effect and expanded its dependency array to `[proposal, searchParams, buildProposalInput, generateAll, genState.isGenerating, genState.completedCount]`.

---

_Fixed: 2026-05-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
