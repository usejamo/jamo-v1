---
plan: 01-05
phase: 01-supabase-foundation
status: complete
completed: 2026-03-06
---

# Plan 01-05: DeletedContext + ArchivedContext Migration — Summary

## What Was Built

Migrated DeletedContext and ArchivedContext from in-memory Sets to Supabase DB columns, and wired AuthProvider as the outermost provider in App.tsx.

## Key Files Modified

- `src/context/DeletedContext.tsx` — soft-delete via `proposals.deleted_at`, exposes deletedIds Set + deletedAt Record, deleteProposal/restoreFromTrash/purgeFromTrash
- `src/context/ArchivedContext.tsx` — toggles `proposals.is_archived` boolean column, exposes archivedIds Set, archive/restore
- `src/pages/ProposalsList.tsx` — updated to await async permanentlyDelete
- `src/App.tsx` — AuthProvider wraps all other providers as outermost layer

## Test Files Created

- `src/context/__tests__/deleted-context.test.ts` — export verification + isWithin30Days utility test
- `src/context/__tests__/archived-context.test.ts` — export verification tests

## Commits

- `a307eb0` feat(01-05): migrate DeletedContext+ArchivedContext to Supabase, wire AuthProvider in App.tsx

## Test Results

- 7 tests passing, 0 failures, 1.91s

## Decisions

- **deletedAt as Record<string, string>**: ISO timestamp strings instead of Map<string, Date> — avoids serialization issues, convert to Date at display time
- **isWithin30Days utility**: Exported for use in ProposalsList "X days remaining" display
- **Provider order in App.tsx**: AuthProvider → ProposalsProvider → DeletedProvider → ArchivedProvider — auth context available to all

## Self-Check: PASSED
