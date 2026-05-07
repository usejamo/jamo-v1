---
phase: "13"
plan: "04"
subsystem: ui-pages
tags: [proposals-list, proposal-detail, status-selector, supabase-queries, archived, deleted]
dependency_graph:
  requires: [13-01, 13-02]
  provides: [Supabase-backed archived/deleted tabs, compact StatusSelector in list, labeled StatusSelector in detail]
  affects: [src/pages/ProposalsList.tsx, src/pages/ProposalDetail.tsx]
tech_stack:
  added: []
  patterns: [direct-supabase-tab-query, compact-status-selector, labeled-status-selector, tabLoading-UX-guard]
key_files:
  created: []
  modified:
    - src/pages/ProposalsList.tsx
    - src/pages/ProposalDetail.tsx
decisions:
  - "Active tab uses proposals from ProposalsContext directly (already filtered is_archived=false AND deleted_at IS NULL at source)"
  - "Archived/deleted tabs fire direct Supabase queries on view change, scoped by org_id + RLS (T-13-08 double-gated)"
  - "tabLoading state gates empty-state message to prevent false no-results flash during fetch"
  - "StatusSelector onClick wrapped in stopPropagation in ProposalsList row to prevent row navigation on status click"
  - "STATUS_COLORS removed from ProposalsList import — StatusSelector component owns its own color rendering"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-07"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 13 Plan 04: ProposalsList & ProposalDetail — Live Filters and StatusSelector Summary

Supabase-backed archived/deleted tab queries replacing in-memory ID-set filtering in ProposalsList, compact StatusSelector replacing static badge in list rows, labeled StatusSelector replacing static badge in ProposalDetail header, and DEMO_NOW removed from ProposalsList.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ProposalsList — Supabase archived/deleted queries, compact StatusSelector, remove DEMO_NOW | 30133df | src/pages/ProposalsList.tsx |
| 2 | ProposalDetail — labeled StatusSelector in header, sweep in_review rename | cbed01f | src/pages/ProposalDetail.tsx |

## Verification Results

1. `grep "DEMO_NOW\|in_review" src/pages/ProposalsList.tsx` → 0 matches (PASS)
2. `grep "in_review" src/pages/ProposalDetail.tsx` → 0 matches (PASS)
3. `grep "is_archived\|deleted_at" src/pages/ProposalsList.tsx` → 3 matches (Supabase queries) (PASS)
4. `grep 'variant="compact"' src/pages/ProposalsList.tsx` → match (PASS)
5. `grep 'variant="labeled"' src/pages/ProposalDetail.tsx` → match (PASS)
6. `npm run test:run` → 30 failed (all pre-existing), no new failures (PASS)
7. `npx tsc --noEmit` → no errors in modified files (PASS)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `isWithin30Days`, `archivedIds`, `deletedAt`, `deletedIds` after in-memory filter replacement**
- **Found during:** Task 1 — TypeScript reported these as unused after the viewProposals derivation was replaced
- **Fix:** Removed `isWithin30Days` from `useDeleted` import; removed `archivedIds` from `useArchived` destructure; removed `deletedAt` and `deletedIds` from `useDeleted` destructure
- **Files modified:** src/pages/ProposalsList.tsx
- **Commit:** 30133df (included in task commit)

**2. [Rule 2 - Missing critical functionality] Added `tabLoading` UX guard on empty state**
- **Found during:** Task 1 — `tabLoading` state was declared but would cause a TS unused-variable error if not wired to JSX
- **Fix:** Added loading indicator in empty state slot; prevents false "No proposals" flash while Supabase query is in-flight
- **Files modified:** src/pages/ProposalsList.tsx
- **Commit:** 30133df (included in task commit)

**3. [Rule 1 - Bug] Added `onClick stopPropagation` on StatusSelector container in ProposalsList rows**
- **Found during:** Task 1 — each list row has an `onClick` that navigates to ProposalDetail; clicking StatusSelector would trigger both the dropdown and row navigation
- **Fix:** Wrapped StatusSelector `<div>` with `onClick={e => e.stopPropagation()}`
- **Files modified:** src/pages/ProposalsList.tsx
- **Commit:** 30133df (included in task commit)

**4. [Rule 1 - Bug] Removed unused `ProposalStatus` import from ProposalDetail after local STATUS_LABELS/STATUS_COLORS removal**
- **Found during:** Task 2 — TypeScript reported TS6133 unused import
- **Fix:** Removed `import type { ProposalStatus } from '../types/proposal'` (no longer needed after STATUS_COLORS removed)
- **Files modified:** src/pages/ProposalDetail.tsx
- **Commit:** cbed01f (included in task commit)

**5. [Rule 1 - Bug] Active tab filter simplified to use `proposals` directly**
- **Found during:** Task 1 — plan spec said `proposals.filter(p => !p.isArchived && !p.deletedAt)` but `Proposal` type has no `isArchived` or `deletedAt` fields
- **Fix:** Active tab uses `proposals` from `useProposals()` directly — the context already queries `is_archived=false AND deleted_at IS NULL` at source, so no further filtering needed
- **Files modified:** src/pages/ProposalsList.tsx
- **Commit:** 30133df (included in task commit)

## Known Stubs

None.

## Threat Flags

None — T-13-08 (org isolation on archived/deleted queries) is double-gated: both `.eq('org_id', profile.org_id)` in query AND Supabase RLS on proposals table. T-13-09 (updateStatus cross-org) protected by RLS via ProposalsContext.updateProposal.

## Self-Check: PASSED

- `src/pages/ProposalsList.tsx` — FOUND
- `src/pages/ProposalDetail.tsx` — FOUND
- Commit 30133df — FOUND (feat(13-04): ProposalsList)
- Commit cbed01f — FOUND (feat(13-04): ProposalDetail)
- `grep "DEMO_NOW" src/pages/ProposalsList.tsx` → 0 matches
- `grep "in_review" src/pages/ProposalDetail.tsx` → 0 matches
- `grep "StatusSelector" src/pages/ProposalsList.tsx` → 2 matches
- `grep "StatusSelector" src/pages/ProposalDetail.tsx` → 2 matches
- `grep "is_archived" src/pages/ProposalsList.tsx` → match (Supabase query)
- `grep "updateStatus" src/pages/ProposalsList.tsx` → match
- `grep "updateStatus" src/pages/ProposalDetail.tsx` → match
