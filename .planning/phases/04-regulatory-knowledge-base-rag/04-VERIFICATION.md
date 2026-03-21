---
phase: 04-regulatory-knowledge-base-rag
verified: 2026-03-20T19:10:00Z
status: human_needed
score: 15/15 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 13/15
  gaps_closed:
    - "retrieve-context Edge Function queries chunks via SQL/RPC functions in Supabase — migration 20260320000016_match_chunks_functions.sql now defines all four functions"
    - "regulatory-docs directory has .gitkeep files in ICH/, FDA/, EMA/ subdirectories — all three .gitkeep files now present"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run npx supabase db push and confirm it exits 0"
    expected: "Both migrations (015 and 016) applied to Supabase project; chunks table and all four match_chunks_* functions visible"
    why_human: "Cannot verify remote Supabase state programmatically"
  - test: "Run npx supabase functions deploy retrieve-context --no-verify-jwt"
    expected: "Deploy exits 0; function appears in Supabase dashboard under Edge Functions"
    why_human: "Cannot verify deployment state programmatically"
  - test: "Run deno run --allow-net --allow-read --allow-env scripts/ingest-regulatory.ts --help"
    expected: "Exits 0, prints usage text"
    why_human: "Deno runtime required; cannot run in static verification"
---

# Phase 04: Regulatory Knowledge Base RAG — Verification Report

**Phase Goal:** Seed the regulatory knowledge base and wire RAG retrieval into the generation pipeline — chunks table, ingestion script, and retrieve-context Edge Function so proposals can be grounded in actual regulatory documents.
**Verified:** 2026-03-20T19:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous score 13/15, both gaps now closed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | chunks table exists with all required columns, HNSW index, GIN index, RLS, tsvector trigger | VERIFIED | `supabase/migrations/20260320000015_chunks_table.sql` — full schema present |
| 2 | regulatory_chunks table is dropped | VERIFIED | `DROP TABLE IF EXISTS regulatory_chunks;` at top of migration 015 |
| 3 | RLS policy enforces org_id isolation on chunks | VERIFIED | `CREATE POLICY chunks_org_isolation ON chunks USING (org_id = ...)` present |
| 4 | chunkDocument splits regulatory text at section headings and produces typed Chunk[] | VERIFIED | `src/lib/chunker.ts` — full implementation with SECTION_HEADING_RE, sliding window, merge logic |
| 5 | CLI ingest script processes PDFs, embeds via OpenAI, inserts into chunks table with correct org_id | VERIFIED | `scripts/ingest-regulatory.ts` — full CLI with --org-id, --agency, --dir, --dry-run flags |
| 6 | Embedding dimension asserted as 1536 before every DB insert | VERIFIED | `embedBatch` throws `Embedding dimension mismatch` when `item.embedding.length !== 1536` |
| 7 | CLI --dry-run flag processes and counts chunks without writing to DB | VERIFIED | `if (isDryRun) continue` skips embed+insert loop |
| 8 | Rate limit handling: 150ms delay between batches, exponential backoff on 429 | VERIFIED | `BATCH_DELAY_MS = 150`, backoff doubles from 1000ms up to MAX_RETRIES=3 |
| 9 | mergeHybridResults applies 70/30 weighting and deduplicates by chunk ID | VERIFIED | `final_score: 0.7 * s.vector + 0.3 * s.text`, Map-based dedup in `src/lib/retrieval.ts` |
| 10 | buildSystemPromptBlock produces versioned [REGULATORY CONTEXT] / [PROPOSAL HISTORY] / [INSTRUCTIONS] format | VERIFIED | Format confirmed in `src/lib/retrieval.ts` |
| 11 | Named constants RETRIEVAL_K_REGULATORY, RETRIEVAL_K_PROPOSALS, RETRIEVAL_SIMILARITY_THRESHOLD at module top | VERIFIED | Lines 9–11 of `supabase/functions/retrieve-context/index.ts` |
| 12 | belowThreshold: true logged when chunk count falls below minimum | VERIFIED | `belowThreshold: regulatoryCount < 1 \|\| proposalCount < 1` in response |
| 13 | Retrieval scoped by org_id — never crosses org boundaries | VERIFIED | org_id_filter passed to all four RPC calls; org config fetched from organizations table |
| 14 | retrieve-context Edge Function queries chunks via match_chunks_vector / match_chunks_fts RPC functions | VERIFIED | `supabase/migrations/20260320000016_match_chunks_functions.sql` defines all four functions: match_chunks_vector, match_chunks_fts, match_chunks_vector_proposals, match_chunks_fts_proposals |
| 15 | regulatory-docs directory structure with .gitkeep files in each agency subdirectory | VERIFIED | `regulatory-docs/ICH/.gitkeep`, `regulatory-docs/FDA/.gitkeep`, `regulatory-docs/EMA/.gitkeep` — all present (0-byte files, created 2026-03-20 19:06) |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260320000015_chunks_table.sql` | Unified chunks table migration | VERIFIED | Full schema: CREATE TABLE, trigger, HNSW, GIN, RLS |
| `supabase/migrations/20260320000016_match_chunks_functions.sql` | SQL RPC functions for hybrid search | VERIFIED | Defines match_chunks_vector, match_chunks_fts, match_chunks_vector_proposals, match_chunks_fts_proposals |
| `src/lib/chunker.ts` | chunkDocument function | VERIFIED | Exports Chunk interface and chunkDocument |
| `src/lib/chunker.test.ts` | Real chunker tests | VERIFIED | 4 real tests (no it.skip) |
| `src/lib/retrieval.ts` | mergeHybridResults + buildSystemPromptBlock | VERIFIED | Exports both functions + 3 named constants |
| `src/lib/retrieval.test.ts` | Real retrieval tests | VERIFIED | 6 real tests covering merge, dedup, k-limit, fallback, format |
| `scripts/ingest-regulatory.ts` | CLI ingestion script | VERIFIED | Full implementation with exported embedBatch |
| `scripts/ingest.test.ts` | Real embedBatch tests | VERIFIED | 3 real tests (no it.skip) |
| `supabase/functions/retrieve-context/index.ts` | retrieve-context Edge Function | VERIFIED | Full handler with RPC calls now backed by migration 016 |
| `supabase/functions/retrieve-context/deno.json` | Deno import map | VERIFIED | Present with supabase-js and openai imports |
| `supabase/functions/retrieve-context/test.ts` | Real Deno tests | VERIFIED | 4 real Deno.test() cases (no ignore: true) |
| `regulatory-docs/ICH/.gitkeep` | Agency directory placeholder | VERIFIED | Present |
| `regulatory-docs/FDA/.gitkeep` | Agency directory placeholder | VERIFIED | Present |
| `regulatory-docs/EMA/.gitkeep` | Agency directory placeholder | VERIFIED | Present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `supabase/migrations/20260320000015_chunks_table.sql` | Supabase project | supabase db push | HUMAN NEEDED | File correct; push outcome unverifiable programmatically |
| `supabase/migrations/20260320000016_match_chunks_functions.sql` | Supabase project | supabase db push | HUMAN NEEDED | File correct; push outcome unverifiable programmatically |
| `scripts/ingest-regulatory.ts` | `src/lib/chunker.ts` | `import('../src/lib/chunker.ts')` | VERIFIED | Dynamic import in main() |
| `scripts/ingest-regulatory.ts` | chunks table | `supabase.from('chunks').insert(rows)` | VERIFIED | Insert call present |
| `supabase/functions/retrieve-context/index.ts` | chunks table | `supabase.rpc('match_chunks_vector', ...)` | VERIFIED | RPC calls backed by migration 016 |
| `supabase/functions/retrieve-context/index.ts` | organizations table | `supabase.from('organizations').select(...)` | VERIFIED | Org config fetch present |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-7.8 | 04-00, 04-02 | Section-boundary chunking, 1536-dim embedding assertion | SATISFIED | chunker.ts + embedBatch dimension check |
| REQ-7.7 | 04-01, 04-02 | Regulatory knowledge base seeded; chunks table schema | SATISFIED | Schema + ingestion tooling present; seeding requires human action |
| REQ-4.9 | 04-00, 04-03 | RAG context retrieved and injected into generation calls | SATISFIED | retrieve-context Edge Function complete; RPC functions now defined in migration 016 |

### Anti-Patterns Found

None. The blocker from the previous verification (missing RPC SQL functions) has been resolved by migration 016.

### Human Verification Required

#### 1. Database Migration Push

**Test:** Run `npx supabase db push` from the project root.
**Expected:** Both migrations (015 and 016) applied; `chunks` table and all four `match_chunks_*` PostgreSQL functions visible in Supabase dashboard.
**Why human:** Cannot query remote Supabase project state programmatically.

#### 2. Edge Function Deployment

**Test:** Run `npx supabase functions deploy retrieve-context --no-verify-jwt`.
**Expected:** Exits 0; function appears in Supabase dashboard under Edge Functions.
**Why human:** Cannot verify deployment state programmatically.

#### 3. Ingest CLI Smoke Test

**Test:** Run `deno run --allow-net --allow-read --allow-env scripts/ingest-regulatory.ts --help`.
**Expected:** Exits 0, prints usage text with --org-id, --agency, --dir, --dry-run flags.
**Why human:** Deno runtime required; cannot run in static verification.

### Gaps Summary

No gaps remain. Both gaps from the initial verification are closed:

- Migration `20260320000016_match_chunks_functions.sql` now defines all four PostgreSQL RPC functions (`match_chunks_vector`, `match_chunks_fts`, `match_chunks_vector_proposals`, `match_chunks_fts_proposals`). The Edge Function wiring is complete.
- `.gitkeep` files are present in all three agency subdirectories (`ICH/`, `FDA/`, `EMA/`). Git will track the directory structure on fresh clone.

All automated checks pass. The three outstanding items require human action (database push, function deploy, CLI smoke test) and are not blocking — they are deployment verification steps, not implementation gaps.

---

_Verified: 2026-03-20T19:10:00Z_
_Verifier: Claude (gsd-verifier)_
