---
phase: "13"
plan: "01"
subsystem: data-layer
tags: [migration, types, seed-data, status-rename]
dependency_graph:
  requires: []
  provides: [ProposalStatus.in_progress, migration-in_review-rename]
  affects: [src/types/proposal.ts, supabase/migrations, src/data/proposals.json]
tech_stack:
  added: []
  patterns: [data-only-migration, text-column-update]
key_files:
  created:
    - supabase/migrations/20260507000029_rename_in_review_to_in_progress.sql
  modified:
    - src/types/proposal.ts
    - src/data/proposals.json
decisions:
  - "Status column is TEXT not enum — migration is data-only UPDATE, no ALTER TYPE needed"
  - "Rename is global (all orgs) intentionally — this is a terminology correction, not a per-org change"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-07"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 13 Plan 01: Rename in_review → in_progress Summary

Renamed proposal status value `in_review` to `in_progress` at the data layer: Supabase migration updating existing DB rows, updated TypeScript ProposalStatus union type, and updated seed/fixture JSON.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write migration to rename in_review → in_progress in DB rows | 17371de | supabase/migrations/20260507000029_rename_in_review_to_in_progress.sql |
| 2 | Rename in_review → in_progress in TypeScript type and seed JSON | 8c6d9c8 | src/types/proposal.ts, src/data/proposals.json |

## Verification Results

1. `grep "in_review" src/types/proposal.ts` → 0 matches (PASS)
2. `grep "in_review" src/data/proposals.json` → 0 matches (PASS)
3. Migration file exists with UPDATE statement (PASS)
4. `in_progress` present in ProposalStatus type (PASS)

## Deviations from Plan

None - plan executed exactly as written. Task 2 changes (types + JSON) were present in working tree from a prior session and committed during this session.

## Known Stubs

None.

## Threat Flags

None - migration is a bounded data-only UPDATE on a TEXT column with no schema destruction.

## Self-Check: PASSED

- `supabase/migrations/20260507000029_rename_in_review_to_in_progress.sql` — FOUND
- `src/types/proposal.ts` contains `in_progress`, no `in_review` — PASS
- `src/data/proposals.json` contains no `in_review` — PASS
- Commit 17371de — FOUND
- Commit 8c6d9c8 — FOUND
