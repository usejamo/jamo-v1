---
phase: "13"
plan: "07"
status: complete
completed: "2026-05-11T00:00:00Z"
---

# Summary: Consolidate in_progress → draft

## What Was Done

- DB migration consolidating all `in_progress` proposal rows to `draft` status
- Removed `in_progress` from the `ProposalStatus` union type — now `'draft' | 'submitted' | 'won' | 'lost'`
- Updated `StatusSelector`, `Dashboard`, `ProposalsList`, and `proposals.json` to remove all `in_progress` references
- Draft now uses the amber color previously held by `in_progress`

## Outcome

Status enum reduced from 5 to 4 values. No `in_progress` references remain in `src/`. Pipeline view is cleaner with a single pre-submission state.
