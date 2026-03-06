---
phase: 01-supabase-foundation
plan: "03"
subsystem: database
tags: [postgres, pgvector, hnsw, storage, rls, supabase]

# Dependency graph
requires:
  - phase: 01-supabase-foundation plan 00
    provides: test infrastructure (vitest + Supabase mock)
  - phase: 01-supabase-foundation plan 01
    provides: Supabase client singleton, CLI linked to project
  - phase: 01-supabase-foundation plan 02
    provides: migration 012 (private.get_user_org_id helper) called by migration 014
provides:
  - regulatory_chunks table with extensions.vector(1536) column and HNSW index (m=16, ef_construction=64)
  - usage_events table with org/user/proposal FK refs, RLS enabled, compound indexes
  - storage.objects RLS policies (INSERT/SELECT/UPDATE/DELETE) scoped to own org via storage.foldername
  - Private 'documents' Storage bucket (created via Supabase dashboard)
  - Migration files 010, 011, 014 — ready for Plan 04 atomic push
affects: [04-migration-push, phase-4-rag, phase-9-usage-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pgvector HNSW index pattern: USING hnsw (col extensions.vector_cosine_ops) WITH (m=16, ef_construction=64)"
    - "Storage path convention: {org_id}/{proposal_id}/{filename} — org enforced via (storage.foldername(name))[1]"
    - "Deferred push pattern: write migration files in parallel plans, push atomically in Plan 04"

key-files:
  created:
    - supabase/migrations/20260305000010_regulatory_chunks.sql
    - supabase/migrations/20260305000011_usage_events.sql
    - supabase/migrations/20260305000014_storage_policies.sql
  modified: []

key-decisions:
  - "extensions.vector(1536) not vector(1536) — pgvector installed in extensions schema (migration 001)"
  - "HNSW over IVFFlat — builds immediately without training data, suitable for initially empty table"
  - "Storage bucket created via dashboard (SQL cannot create Storage buckets), policies written in SQL"
  - "Migration 014 deferred to Plan 04 push — calls private.get_user_org_id() from Plan 02's migration 012; numeric order (010 < 011 < 012 < 013 < 014) ensures correct dependency resolution"
  - "regulatory_chunks has no org_id — shared platform knowledge base, all authenticated users can read"
  - "usage_events RLS uses usage_events_all policy covering all operations via private.get_user_org_id()"

patterns-established:
  - "Storage RLS pattern: bucket_id = 'documents' AND (storage.foldername(name))[1] = (SELECT private.get_user_org_id())::text"
  - "Append-only audit table: no soft-delete column on usage_events — events are immutable"

requirements-completed: [REQ-7.5, REQ-7.6, REQ-7.7, REQ-7.8, REQ-7.9, REQ-7.10]

# Metrics
duration: ~10min (includes human Task 1 checkpoint for bucket creation)
completed: 2026-03-06
---

# Phase 01 Plan 03: Supabase Foundation — Regulatory Chunks, Usage Events, Storage RLS Summary

**regulatory_chunks table with pgvector HNSW index (vector_cosine_ops, m=16), usage_events audit table with org RLS, and 4 storage.objects policies enforcing org-scoped access via path prefix**

## Performance

- **Duration:** ~10 min (including human Task 1 bucket creation checkpoint)
- **Started:** 2026-03-06T09:45Z
- **Completed:** 2026-03-06T09:47Z
- **Tasks:** 2 (Task 1 human-action, Task 2 auto)
- **Files modified:** 3

## Accomplishments

- regulatory_chunks table ready for Phase 4 RAG ingestion — vector column exists but is nullable, HNSW index builds immediately on empty table
- usage_events table captures all billable events (proposal_generated, section_generated, document_processed, ai_chat_message, rag_query, export_generated) from day one
- Storage RLS enforces org isolation via path prefix: `{org_id}/{proposal_id}/{filename}` — org A cannot read, write, update, or delete org B's files
- Private 'documents' bucket confirmed in Supabase dashboard (project fuuvdcvbliijffogjnwg)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create private 'documents' Storage bucket** — Human action (no commit — dashboard operation)
2. **Task 2: Write migrations 010, 011, 014** — `bb6d617` (feat)

**Plan metadata:** (docs commit — see state updates)

## Files Created/Modified

- `supabase/migrations/20260305000010_regulatory_chunks.sql` — regulatory_chunks table + HNSW index with extensions.vector(1536)
- `supabase/migrations/20260305000011_usage_events.sql` — usage_events table with RLS enabled + org_id/created_at indexes
- `supabase/migrations/20260305000014_storage_policies.sql` — storage.objects 4-policy RLS + usage_events_all policy

## Decisions Made

- `extensions.vector(1536)` notation required because pgvector was installed in the `extensions` schema (migration 001), not the default `public` schema
- HNSW chosen over IVFFlat: HNSW builds immediately without requiring training data, making it correct for an initially empty table; IVFFlat would require `CREATE INDEX CONCURRENTLY` after data insertion
- Storage bucket created via Supabase dashboard — the `storage` schema is managed by PostgRESS/Supabase internals and buckets cannot be inserted via SQL migration
- Migration 014 deferred to Plan 04's atomic push to guarantee execution after migration 012 (which defines `private.get_user_org_id()`)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 3 files written cleanly, tests remain green (1 passed, 2 skipped).

## User Setup Required

Task 1 was a human-action checkpoint. The private 'documents' Storage bucket was created in the Supabase dashboard for project `fuuvdcvbliijffogjnwg`. No further external configuration required for this plan.

## Next Phase Readiness

- Migration files 010, 011, 014 written to disk and ready
- Plan 02's migration files (001-009, 012-013) already exist
- All 14 migration files will be present after Plan 02 and 03 complete
- Plan 04 can now perform the single atomic `supabase db push` to push all 14 migrations in numeric order
- Risk watch: pgvector version — if HNSW unavailable (pgvector < 0.5.0), migration 010 will fail; verify in Plan 04 and fall back to IVFFlat if needed

---
*Phase: 01-supabase-foundation*
*Completed: 2026-03-06*
