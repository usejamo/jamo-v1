---
phase: 04-regulatory-knowledge-base-rag
plan: "04"
subsystem: database
tags: [postgresql, pgvector, rpc, migration, rag, gap-closure]
dependency_graph:
  requires:
    - 04-03 (retrieve-context Edge Function)
    - 04-01 (chunks table migration)
  provides:
    - match_chunks_vector PostgreSQL function
    - match_chunks_fts PostgreSQL function
    - match_chunks_vector_proposals PostgreSQL function
    - match_chunks_fts_proposals PostgreSQL function
  affects:
    - supabase/functions/retrieve-context/index.ts (RPC calls now resolve)
tech_stack:
  added: []
  patterns:
    - SECURITY DEFINER SQL functions with search_path hardening
    - extensions.vector(1536) cosine similarity via <=> operator
    - ts_rank + plainto_tsquery full-text search
    - Nullable array filter pattern (IS NULL OR col = ANY(arr))
key_files:
  created:
    - supabase/migrations/20260320000016_match_chunks_functions.sql
  modified: []
decisions:
  - "SECURITY DEFINER used (not RLS) — Edge Function authenticates as service role; org isolation enforced via WHERE org_id = org_id_filter"
  - "SET search_path = public, extensions prevents search_path injection on SECURITY DEFINER functions"
  - "Nullable array filter pattern allows Edge Function to pass NULL for agencies_filter/therapeutic_areas_filter to skip those filters"
metrics:
  duration: "10 minutes"
  completed_date: "2026-03-20"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
requirements:
  - REQ-4.9
---

# Phase 04 Plan 04: Match Chunks SQL Functions Summary

**One-liner:** Four SECURITY DEFINER PostgreSQL RPC functions wiring retrieve-context Edge Function to the chunks table via pgvector cosine similarity and tsvector full-text search.

---

## What Was Built

Migration `20260320000016_match_chunks_functions.sql` defines four PostgreSQL functions called by the retrieve-context Edge Function via `supabase.rpc()`:

| Function | doc_type filter | Search type | Extra filters |
|---|---|---|---|
| `match_chunks_vector` | regulatory | pgvector cosine (<=>) | agencies, therapeutic_areas, similarity_threshold |
| `match_chunks_fts` | regulatory | tsvector ts_rank | agencies, therapeutic_areas |
| `match_chunks_vector_proposals` | proposal | pgvector cosine (<=>) | similarity_threshold |
| `match_chunks_fts_proposals` | proposal | tsvector ts_rank | — |

All four functions:
- Use `LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions`
- Accept `org_id_filter UUID` for org isolation (replaces RLS, which is bypassed for service role)
- Use nullable array filter pattern: `(arr IS NULL OR col = ANY(arr))`
- Return `(id, content, source, agency, therapeutic_area, doc_type, vector_score|text_score)`

---

## Gap Closed

Before this plan: `retrieve-context` Edge Function called four `supabase.rpc()` functions that did not exist in any migration — every real invocation threw a Postgres function-not-found error.

After this plan: All four RPC targets are defined. REQ-4.9 (RAG retrieval) is fully wired end-to-end.

Human verification step (not automated): `npx supabase db push` to apply migration to project `fuuvdcvbliijffogjnwg`.

---

## Decisions Made

1. **SECURITY DEFINER over RLS** — Edge Function runs as service role (bypasses RLS). Org isolation is enforced by `WHERE org_id = org_id_filter` inside the function body.
2. **search_path hardening** — `SET search_path = public, extensions` on all SECURITY DEFINER functions prevents search_path injection attacks.
3. **Nullable array filters** — `(agencies_filter IS NULL OR agency = ANY(agencies_filter))` allows the Edge Function to pass `null` when no agency filter is needed, without requiring separate function variants.

---

## Deviations from Plan

None — plan executed exactly as written. Migration file was pre-written and verified before this summary was created.

---

## Self-Check

- [x] `supabase/migrations/20260320000016_match_chunks_functions.sql` exists
- [x] Commit `2282fab` — `feat(04-04): add match_chunks SQL functions migration`
- [x] grep count of `CREATE OR REPLACE FUNCTION` = 4
- [x] All four function names present
- [x] SECURITY DEFINER + SET search_path on all functions

## Self-Check: PASSED
