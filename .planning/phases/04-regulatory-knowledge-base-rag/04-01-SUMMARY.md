---
phase: 04-regulatory-knowledge-base-rag
plan: "01"
subsystem: database
tags: [supabase, postgres, pgvector, hnsw, tsvector, rls, hybrid-search]

requires:
  - phase: 01-supabase-foundation
    provides: "organizations table, user_profiles table, extensions schema with pgvector, RLS helper pattern"
provides:
  - "chunks table with multi-tenant org_id isolation"
  - "HNSW vector index on embedding extensions.vector(1536)"
  - "GIN full-text index on search_vector TSVECTOR"
  - "tsvector auto-update trigger on INSERT/UPDATE"
  - "RLS policy enforcing org_id isolation"
  - "Composite (org_id, doc_type) index for retrieve-context queries"
affects:
  - 04-02-chunker
  - 04-03-retrieve-context

tech-stack:
  added: []
  patterns:
    - "extensions.vector(1536) notation for pgvector installed in extensions schema"
    - "HNSW parameters m=16, ef_construction=64 matching Phase 1 baseline"
    - "tsvector trigger created BEFORE any data insert — Supabase locked pattern"
    - "RLS via subquery: org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())"

key-files:
  created:
    - supabase/migrations/20260320000015_chunks_table.sql
  modified: []

key-decisions:
  - "DROP TABLE IF EXISTS regulatory_chunks — safe, no production data per RESEARCH.md Pitfall 1"
  - "doc_type CHECK constraint: ('regulatory', 'proposal') — supports both ingestion paths"
  - "db push auth gate noted but not a blocking issue — push deferred to developer manual step"

patterns-established:
  - "Hybrid search pattern: HNSW index for vector similarity + GIN index on tsvector for keyword search"
  - "Multi-tenant chunk isolation: org_id FK to organizations + RLS policy"

requirements-completed:
  - REQ-7.7
  - REQ-7.8

duration: 5min
completed: 2026-03-20
---

# Phase 04 Plan 01: Chunks Table Migration Summary

**Unified `chunks` table replacing `regulatory_chunks` with multi-tenant isolation, hybrid search (HNSW + GIN tsvector), and both ingestion path support via doc_type constraint.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-20T18:20:00Z
- **Completed:** 2026-03-20T18:25:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Migration 015 written with exact schema from RESEARCH.md Pattern 5
- `regulatory_chunks` dropped, `chunks` table created with org_id, doc_type, embedding, search_vector, agency, therapeutic_area, metadata columns
- HNSW index (m=16, ef_construction=64, cosine), GIN index, composite index, RLS policy all established

## Task Commits

1. **Task 1: Write chunks table migration** - `b0bddd3` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `supabase/migrations/20260320000015_chunks_table.sql` - Drops regulatory_chunks; creates unified chunks table with vector index, tsvector trigger, GIN index, composite index, and RLS

## Decisions Made

- Migration file already existed on disk with correct content — confirmed match against plan spec, no rewrite needed.
- `npx supabase db push --dry-run` returned auth gate error (no access token). Per plan: noted in summary, no checkpoint created. Developer must run `npx supabase login` then `npx supabase db push` to apply migration.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npx supabase db push --dry-run` failed with auth error: "Access token not provided. Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable." Per plan instructions this is expected dev infrastructure — noted here, not a blocking issue.

## User Setup Required

To apply this migration to the live Supabase project (fuuvdcvbliijffogjnwg):

```bash
npx supabase login
npx supabase db push
```

Verify with: `SELECT table_name FROM information_schema.tables WHERE table_name = 'chunks'` in Supabase SQL editor — should return one row.

## Next Phase Readiness

- `chunks` table schema is final — ingestion plans (04-02 chunker, 04-03 ingest Edge Function) can reference it
- `retrieve-context` Edge Function (04-04) depends on `(org_id, doc_type)` index and `embedding` column — both present
- Migration must be applied (`supabase db push`) before any data can be inserted

---
*Phase: 04-regulatory-knowledge-base-rag*
*Completed: 2026-03-20*
