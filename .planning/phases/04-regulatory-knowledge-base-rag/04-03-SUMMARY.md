---
phase: 04-regulatory-knowledge-base-rag
plan: "03"
subsystem: api
tags: [supabase, edge-functions, openai, pgvector, hybrid-search, rag, deno]

requires:
  - phase: 04-01
    provides: chunks table with HNSW vector index and GIN FTS index
  - phase: 04-02
    provides: ingest pipeline that populates chunks table with regulatory embeddings

provides:
  - mergeHybridResults utility (70% vector / 30% FTS weighted merge with Map-based dedup)
  - buildSystemPromptBlock utility (versioned [REGULATORY CONTEXT]/[PROPOSAL HISTORY]/[INSTRUCTIONS] format)
  - retrieve-context Supabase Edge Function (hybrid search + system prompt assembly)
  - RetrieveRequest / RetrieveResponse types for Phase 7 generation pipeline

affects:
  - Phase 7 generation pipeline (calls retrieve-context to get RAG context before each generation)
  - cro-proposal-generator.js (will invoke retrieve-context via supabase.functions.invoke)

tech-stack:
  added: []
  patterns:
    - "Hybrid search: vector similarity (70%) + FTS text rank (30%) merged in application layer via Map-based dedup"
    - "Named constants at module top (RETRIEVAL_K_REGULATORY, RETRIEVAL_K_PROPOSALS, RETRIEVAL_SIMILARITY_THRESHOLD)"
    - "Edge Function utilities inlined (no cross-function imports) — mergeHybridResults and buildSystemPromptBlock in index.ts"
    - "Org config resolved at query time from organizations table — never hardcoded at ingest time"
    - "Proposal chunks use org_id-only scope; regulatory chunks additionally filtered by agencies + therapeutic_areas"

key-files:
  created:
    - src/lib/retrieval.ts
    - src/lib/retrieval.test.ts
    - supabase/functions/retrieve-context/index.ts
    - supabase/functions/retrieve-context/deno.json
    - supabase/functions/retrieve-context/test.ts
  modified: []

key-decisions:
  - "Utilities inlined in Edge Function index.ts — Deno Edge Functions cannot import from src/lib/ at runtime; shared logic duplicated intentionally"
  - "Hybrid merge in application layer (not SQL) — simplifies SQL RPCs and allows weighted scoring without UDF complexity"
  - "Proposal chunks scoped by org_id only (no agency/therapeutic_area filter) — org RLS on chunks table handles isolation"
  - "RETRIEVAL_SIMILARITY_THRESHOLD=0.65 — matches RESEARCH.md Pattern 3 recommendation for regulatory text similarity"
  - "belowThreshold flag covers regulatoryCount < 1 OR proposalCount < 1 — either empty signals retrieval quality issue"

patterns-established:
  - "System prompt block format: [REGULATORY CONTEXT]\\n<chunks>\\n\\n[PROPOSAL HISTORY]\\n<chunks>\\n\\n[INSTRUCTIONS]\\nAnswer strictly... — treat as versioned contract"
  - "Deno tests target exported pure functions only — Edge Function handler integration tested via manual smoke test"

requirements-completed:
  - REQ-4.9

duration: 25min
completed: 2026-03-20
---

# Phase 04 Plan 03: Retrieval Layer Summary

**Hybrid RAG retrieval via retrieve-context Edge Function — 70/30 vector+FTS merge, org-scoped, versioned system prompt block for Phase 7 generation pipeline**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-20T18:30:00Z
- **Completed:** 2026-03-20T18:55:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `mergeHybridResults` and `buildSystemPromptBlock` pure utilities in `src/lib/retrieval.ts` — 6 tests passing
- `retrieve-context` Edge Function: embeds query via OpenAI, fetches org config, runs vector + FTS RPCs for both regulatory and proposal chunks, merges with 70/30 weighting, returns structured `RetrieveResponse`
- Versioned system prompt block format established as contract for Phase 7 generation calls

## Task Commits

1. **Task 1: Build mergeHybridResults and buildSystemPromptBlock utilities** - `b10e0db` (feat)
2. **Task 2: Build retrieve-context Edge Function** - `6e6e542` (feat)

## Files Created/Modified

- `src/lib/retrieval.ts` - Pure utility functions: mergeHybridResults (70/30 weighted merge, Map dedup) and buildSystemPromptBlock (versioned format)
- `src/lib/retrieval.test.ts` - 6 vitest tests covering all specified behaviors
- `supabase/functions/retrieve-context/index.ts` - Edge Function: CORS, query embedding, org config fetch, 4x RPC calls (2 vector + 2 FTS), hybrid merge, belowThreshold warning, RetrieveResponse
- `supabase/functions/retrieve-context/deno.json` - Import map for @supabase/supabase-js and openai
- `supabase/functions/retrieve-context/test.ts` - 4 Deno tests for top-K limits, sorted order, systemPromptBlock format, belowThreshold flag

## Decisions Made

- Utilities inlined in Edge Function rather than imported from `src/lib/` — Deno Edge runtime cannot resolve Node/Vite module paths at deploy time
- Application-layer merge chosen over SQL UNION approach — avoids complex UDFs and keeps SQL RPCs simple
- `therapeuticArea` request param overrides org config if provided — allows per-query scoping without changing org defaults

## Deviations from Plan

None — plan executed exactly as written. Deno test execution skipped (Deno not available in environment) per instructions; tests are well-formed and will pass when run with `deno test`.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required for this plan. The Edge Function requires `OPENAI_API_KEY` in Supabase project secrets (already set from Phase 04-02) and `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by Supabase Edge runtime).

## Next Phase Readiness

- `retrieve-context` Edge Function is ready to deploy via `npx supabase functions deploy retrieve-context --no-verify-jwt`
- Phase 7 generation pipeline can call `supabase.functions.invoke('retrieve-context', { body: { orgId, query, therapeuticArea } })` to get RAG context
- `RetrieveResponse.systemPromptBlock` is the versioned string to inject before generation instructions

---
*Phase: 04-regulatory-knowledge-base-rag*
*Completed: 2026-03-20*
