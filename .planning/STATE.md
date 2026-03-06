# STATE.md — Project Memory

**Last updated:** 2026-03-06
**Current milestone:** Milestone 1 — MVP
**Current phase:** 01-supabase-foundation — Plan 04 of 6 (Plans 00-03 complete)

---

## Project Status

| Item | Status |
|------|--------|
| PROJECT.md | Complete |
| REQUIREMENTS.md | Complete |
| ROADMAP.md | Complete (13 phases) |
| Codebase map | Complete (.planning/codebase/) |
| Research | Complete (.planning/research/) |
| Phase execution | In progress — Phase 01 Plans 00-03 complete |

---

## Next Action

Execute Plan 01-04: Atomic `supabase db push` — push all 14 migrations to project fuuvdcvbliijffogjnwg (Phase 01, Plan 4 of 6).

## Last Session

**Stopped at:** Completed 01-supabase-foundation Plan 03 (regulatory_chunks, usage_events, storage RLS migration files)
**Session date:** 2026-03-06

---

## Active Decisions

- **Env file location:** `.env` (not `.env.local`) — project already used .env; both are gitignored, Vite reads both
- **Supabase project ref:** `fuuvdcvbliijffogjnwg` (live project, region: auto)
- **Key name:** `VITE_SUPABASE_PUBLISHABLE_KEY` (new Supabase post-Nov 2025 naming, not VITE_SUPABASE_ANON_KEY)
- **Test mock pattern:** `import { supabase } from '../../test/mocks/supabase'` — chainable vi.fn() mock for all Supabase query methods
- **Stub test pattern:** Use `it.skip` (not dynamic imports) for tests targeting files not yet created — Vite resolves all imports at transform time
- **test:run scope:** No --coverage flag to keep runs under 15 seconds
- **Editor:** TipTap v2 (replaces ProposalDraftRenderer)
- **Backend:** Supabase (Edge Functions, Postgres, Storage, Auth, Realtime, pgvector)
- **AI:** Anthropic Claude (claude-sonnet-4-5 for generation, claude-haiku for extraction/anchors)
- **Embeddings:** OpenAI text-embedding-3-small (Anthropic has no embedding API)
- **PDF parsing:** npm:pdf-parse via lib path (Deno) — prototype before full wiring
- **DOCX export:** `docx` npm package, client-side
- **XLSX:** pin to npm:xlsx@0.18.5 (0.19+ proprietary license)
- **Salesforce auth:** JWT Bearer Token flow via Deno Web Crypto
- **Streaming:** Two-phase (buffer SSE → load TipTap on complete)
- **Generation order:** Study Understanding first, Cover Letter last
- **pgvector column notation:** `extensions.vector(1536)` (not `vector(1536)`) — pgvector installed in extensions schema (migration 001)
- **HNSW over IVFFlat:** HNSW builds immediately on empty table; IVFFlat requires training data first
- **Storage path convention:** `{org_id}/{proposal_id}/{filename}` — org enforced via `(storage.foldername(name))[1]`
- **Storage bucket creation:** Via Supabase dashboard (SQL cannot create Storage buckets), policies written in SQL migrations
- **Deferred push pattern:** All 14 migration files written in Plans 02-03, pushed atomically once in Plan 04

## Critical Risks to Watch

1. `pdf-parse` Deno import gotcha — prototype in Phase 3 before full wiring
2. Edge Function 150s timeout — section-by-section + Realtime polling mitigates this
3. TipTap React 19 compatibility — smoke-test on install in Phase 8
4. SheetJS license — pin to 0.18.5 strictly
5. pgvector version on Supabase project — check HNSW availability before Phase 4

---

## Completed Plans

### Phase 01: Supabase Foundation
- **Plan 00** (2026-03-05): Test infrastructure — vitest + jsdom + Supabase mock + stub tests. `npm run test:run` exits 0 in 1.28s.
- **Plan 01** (2026-03-06): Supabase client singleton — @supabase/supabase-js installed, CLI linked to project fuuvdcvbliijffogjnwg, src/lib/supabase.ts typed with Database generic, placeholder types in src/types/database.types.ts. `npm run test:run` exits 0 in 1.29s.
- **Plan 02** (2026-03-06): Database schema migrations (001-009, 012-013) — organizations, user_profiles, proposals, proposal_sections, proposal_documents, document_extracts, proposal_assumptions, proposal_chats, rls_helper_functions, rls_policies. All 11 migration files written; no push yet.
- **Plan 03** (2026-03-06): Infrastructure migrations — regulatory_chunks (pgvector HNSW, extensions.vector(1536)), usage_events (org RLS, audit trail), storage_policies (4 storage.objects RLS policies + usage_events_all). Migration files 010, 011, 014 written; private 'documents' bucket created in dashboard. No push yet.

---

## Key Files

| File | Purpose |
|------|---------|
| `.planning/PROJECT.md` | Full project context + 13 feature decisions + architecture principles |
| `.planning/REQUIREMENTS.md` | 12 requirement groups, REQ-1.x through REQ-12.x |
| `.planning/ROADMAP.md` | 13-phase MVP plan + Milestone 2 backlog |
| `.planning/codebase/` | Full codebase map (7 documents) |
| `.planning/research/` | 4 research documents from parallel agents |
| `cro-proposal-generator.js` | Anthropic API module — production-ready, not yet wired |
| `cro_proposal_prompt_template.md` | Prompt template reference doc |
| `src/components/AIChatPanel.tsx` | Demo AI chat — to be upgraded in Phase 9 |
| `src/components/ProposalDraftRenderer.tsx` | Read-only renderer — to be replaced by TipTap in Phase 8 |
