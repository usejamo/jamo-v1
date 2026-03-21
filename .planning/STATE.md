---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04-regulatory-knowledge-base-rag (COMPLETE — 4/4 plans complete)
status: in_progress
stopped_at: Completed 04-03-PLAN.md
last_updated: "2026-03-20T19:00:00.000Z"
progress:
  total_phases: 13
  completed_phases: 4
  total_plans: 19
  completed_plans: 19
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02-authentication-routing (in progress — 3/3 plans complete)
status: unknown
stopped_at: Completed 02-02-PLAN.md
last_updated: "2026-03-07T03:54:00.336Z"
progress:
  total_phases: 13
  completed_phases: 2
  total_plans: 9
  completed_plans: 9
  percent: 100
---
---

# STATE.md — Project Memory

**Last updated:** 2026-03-20
**Current milestone:** Milestone 1 — MVP
**Current phase:** 04-regulatory-knowledge-base-rag (COMPLETE — 4/4 plans complete)

---

## Project Status

| Item | Status |
|------|--------|
| PROJECT.md | Complete |
| REQUIREMENTS.md | Complete |
| ROADMAP.md | Complete (13 phases) |
| Codebase map | Complete (.planning/codebase/) |
| Research | Complete (.planning/research/) |
| Phase execution | Phase 01 COMPLETE, Phase 02 COMPLETE, Phase 03 COMPLETE, Phase 04 in progress |

---

## Next Action

Phase 04 COMPLETE. Next: Phase 05 (next phase per ROADMAP.md).

## Last Session

**Stopped at:** Completed 04-03-PLAN.md
**Session date:** 2026-03-20

---

## Active Decisions

- **Env file location:** `.env` (not `.env.local`) — project already used .env; both are gitignored, Vite reads both
- **Supabase project ref:** `fuuvdcvbliijffogjnwg` (live project, region: auto)
- **Key name:** `VITE_SUPABASE_PUBLISHABLE_KEY` (new Supabase post-Nov 2025 naming, not VITE_SUPABASE_ANON_KEY)
- **Test mock pattern:** Inline `vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn()... } }))` — NOT `() => import(...)` which resolves the full supabase-js module and OOMs
- **No renderHook in context tests:** `@testing-library/react` pulls react-dom; OOMs even with 4GB heap on dev machine — use import assertions instead
- **vitest version:** 4.0.4 (4.0.18 has known memory leak regression, GitHub issue #9560)
- **vitest pool:** `forks` + `singleFork: true` + `execArgv: ['--max-old-space-size=4096']` + `environment: happy-dom`
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
- **Auth method response pattern:** signIn, signOut, signUp return raw Supabase response ({ data, error }) — let callers handle errors for flexible UX control

- **js-tiktoken export name:** `getEncoding` (camelCase) — plan spec had `get_encoding` (snake_case); corrected in chunker.ts
- **Vitest/Deno compat pattern:** `denoSpecifierStubPlugin` in vitest.config.ts stubs `jsr:` and `npm:` specifiers — `@vite-ignore` comments alone insufficient for Vite transform-time resolution
- **CLI/test isolation:** `import.meta.main` guard in ingest-regulatory.ts prevents CLI code from executing under Vitest
- **Edge Function utilities inlined:** mergeHybridResults and buildSystemPromptBlock duplicated in index.ts — Deno Edge runtime cannot resolve src/lib/ imports at deploy time
- **Hybrid merge in app layer:** 70/30 vector+FTS weighted merge done in application layer (not SQL UDF) — keeps RPCs simple
- **System prompt block format is versioned contract:** [REGULATORY CONTEXT]/[PROPOSAL HISTORY]/[INSTRUCTIONS] — Phase 7 depends on this exact format

- **Login page layout:** Full-screen centered card (not floating modal) — provides clear focus on authentication flow
- **ProtectedRoute pattern:** Uses React Router v7 Outlet pattern � clean separation of auth logic from route definitions
- **Layout placement:** Nested inside ProtectedRoute � ensures Sidebar only renders for authenticated users

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
- **Plan 02** (2026-03-06): Database schema migrations (001-009, 012-013) — organizations, user_profiles, proposals, proposal_sections, proposal_documents, document_extracts, proposal_assumptions, proposal_chats, rls_helper_functions, rls_policies. 11 migration files written.
- **Plan 03** (2026-03-06): Infrastructure migrations — regulatory_chunks (pgvector HNSW, extensions.vector(1536)), usage_events (org RLS, audit trail), storage_policies (4 storage.objects RLS policies + usage_events_all). Migration files 010, 011, 014 written; private 'documents' bucket created in dashboard.
- **Plan 04** (2026-03-06): All 14 migrations pushed atomically to project fuuvdcvbliijffogjnwg. database.types.ts generated (700 lines). AuthContext created (session/user/profile/loading). ProposalsContext migrated to async Supabase CRUD.
- **Plan 05** (2026-03-06): DeletedContext (proposals.deleted_at soft-delete), ArchivedContext (proposals.is_archived toggle). AuthProvider wired as outermost in App.tsx. 7 tests green.

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

### Phase 02: Authentication & Routing
- **Plan 01** (2026-03-06): Auth methods — Extended AuthContext with signIn, signOut, signUp methods delegating to Supabase auth. TDD implementation with 4 new tests, all 11 tests passing. Auth state auto-synced via onAuthStateChange.
- **Plan 03** (2026-03-06): Logout & Profile Display — Added logout button to Sidebar calling signOut and navigating to /login. Added Profile tab to Settings as first tab, displaying user name, email, role (as badge), and org_id. Role awareness foundation for REQ-8.3.

### Phase 04: Regulatory Knowledge Base & RAG
- **Plan 00** (2026-03-20): Wave 0 test stub scaffolding — 4 Nyquist-compliant stub files (chunker.test.ts, retrieval.test.ts, ingest.test.ts, retrieve-context/test.ts). All use it.skip / Deno ignore:true per stub test pattern. `npm run test:run` exits 0 with 34 passing + 11 skipped.
- **Plan 01** (2026-03-20): Chunks table migration 015 — DROP regulatory_chunks, CREATE chunks with org_id, doc_type, embedding extensions.vector(1536), search_vector TSVECTOR, HNSW index (m=16, ef_construction=64), GIN index, composite (org_id, doc_type) index, tsvector trigger, RLS org isolation policy. `supabase db push` requires `npx supabase login` first.
- **Plan 02** (2026-03-20): Regulatory ingestion pipeline — chunkDocument (js-tiktoken cl100k_base, section-boundary split, 400-600 token chunks, 100-token overlap), embedBatch (batches=100, 1536-dim assert, exp backoff on 429), ingest-regulatory.ts CLI (--org-id/--agency/--dir/--dry-run), regulatory-docs/ICH/FDA/EMA dirs. denoSpecifierStubPlugin in vitest.config.ts for jsr:/npm: compat. 47/47 tests passing.
- **Plan 03** (2026-03-20): Retrieval layer — mergeHybridResults (70/30 vector+FTS weighted merge, Map-based dedup), buildSystemPromptBlock (versioned [REGULATORY CONTEXT]/[PROPOSAL HISTORY]/[INSTRUCTIONS] format), retrieve-context Edge Function (org-scoped hybrid search, OpenAI query embedding, belowThreshold warning, RetrieveResponse). 6 vitest tests + 4 Deno tests passing.

### Phase 03: Document Upload & Parsing Pipeline
- **Plan 00** (2026-03-07): Test infrastructure scaffolding (Wave 0) — Created UI component test stubs (FileUpload.test.tsx with 5 todo tests, DocumentList.test.tsx with 4 todo tests) and Edge Function test harnesses (extract-document-poc/test.ts, extract-document/test.ts with 5 stub tests). Added 4 minimal valid test fixtures (test-rfp.pdf, test-protocol.docx, test-budget.xlsx, corrupt.pdf). Nyquist compliance achieved for Phase 3.
- **Plan 01** (2026-03-07): FileUpload component — Drag-and-drop file upload with direct browser → Supabase Storage upload (no proxy). Validates file types (PDF/DOCX/XLSX/TXT) and size (max 50MB). Org-scoped storage paths ({org_id}/{proposal_id}/{filename}). Inserts proposal_documents row with parse_status='pending'. Per-file status tracking with visual indicators (spinner/check/X). Storage cleanup on database errors. TDD with 5 tests passing.
- **Plan 02** (2026-03-07): DocumentList component — Displays uploaded documents with color-coded status badges (gray/blue/green/red for pending/extracting/complete/error). Polls every 2s when documents extracting. Delete removes from Storage + database. TDD with chainable mock query builder. 5 tests passing.
- **Plan 04** (2026-03-07): extract-document Edge Function — Deno edge function using pdf-parse, mammoth, xlsx for text extraction from PDF/DOCX/XLSX/TXT. Inserts into document_extracts, updates parse_status. Deployed with --no-verify-jwt.
- **Plan 05** (2026-03-19): End-to-end pipeline wiring — FileUpload triggers extract-document fire-and-forget after upload. DocumentList polls on pending+extracting status. ProposalDetail wired with real components. UAT fixes: uploaded_by FK, RLS subquery policy. Full pipeline verified end-to-end.

