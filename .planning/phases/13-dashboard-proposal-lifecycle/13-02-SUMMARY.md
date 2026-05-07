---
phase: "13"
plan: "02"
subsystem: ui-components
tags: [status-selector, context, confirmation-modal, dropdown]
dependency_graph:
  requires: [13-01]
  provides: [StatusSelector, STATUS_LABELS, STATUS_COLORS, updateStatus]
  affects: [src/components/StatusSelector.tsx, src/context/ProposalsContext.tsx]
tech_stack:
  added: []
  patterns: [dropdown-with-outside-click, confirmation-modal, thin-wrapper-context]
key_files:
  created:
    - src/components/StatusSelector.tsx
  modified:
    - src/context/ProposalsContext.tsx
decisions:
  - "STATUS_LABELS and STATUS_COLORS exported from StatusSelector.tsx as shared constants — eliminates triple-maintenance across Dashboard, ProposalsList, ProposalDetail"
  - "TERMINAL_STATUSES = ['won', 'lost'] gated behind confirmation modal; all others apply immediately"
  - "updateStatus is a thin wrapper over updateProposal — no direct Supabase call, delegates camelCase→snake_case mapping to updateProposal"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-07"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 13 Plan 02: StatusSelector Component & updateStatus Summary

Shared StatusSelector component with compact badge and labeled variants, including confirmation modal for won/lost terminal transitions. `updateStatus` thin wrapper added to ProposalsContext, making status changes available from `useProposals()`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create StatusSelector component with compact and labeled variants | 078e6ad | src/components/StatusSelector.tsx |
| 2 | Add updateStatus to ProposalsContext | 1596f10 | src/context/ProposalsContext.tsx |

## Verification Results

1. `grep "STATUS_LABELS" src/components/StatusSelector.tsx` → match (PASS)
2. `grep "STATUS_COLORS" src/components/StatusSelector.tsx` → match (PASS)
3. `grep "variant.*compact.*labeled" src/components/StatusSelector.tsx` → match (PASS)
4. `grep "updateStatus" src/context/ProposalsContext.tsx` → 3 matches (PASS)
5. `npm run test:run` → 30 failed (all pre-existing), no new failures (PASS)
6. `npx tsc --noEmit` → no errors in StatusSelector.tsx or ProposalsContext.tsx (PASS, pre-existing errors in unrelated files)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None - T-13-03 (org isolation) is enforced by existing RLS on proposals table via updateProposal. T-13-05 (terminal status friction) implemented via confirmation modal in StatusSelector.

## Self-Check: PASSED

- `src/components/StatusSelector.tsx` — FOUND
- `src/context/ProposalsContext.tsx` contains 3 `updateStatus` occurrences — PASS
- Commit 078e6ad — FOUND
- Commit 1596f10 — FOUND
