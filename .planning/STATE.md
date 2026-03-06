# STATE.md — Project Memory

**Last updated:** 2026-03-05
**Current milestone:** Milestone 1 — MVP
**Current phase:** 01-supabase-foundation — Plan 01 of 6 (Plan 00 complete)

---

## Project Status

| Item | Status |
|------|--------|
| PROJECT.md | Complete |
| REQUIREMENTS.md | Complete |
| ROADMAP.md | Complete (13 phases) |
| Codebase map | Complete (.planning/codebase/) |
| Research | Complete (.planning/research/) |
| Phase execution | In progress — Phase 01 Plan 00 complete |

---

## Next Action

Execute Plan 01-01: Supabase client singleton + env validation (Phase 01, Plan 1 of 6).

## Last Session

**Stopped at:** Completed 01-supabase-foundation Plan 00 (test infrastructure)
**Session date:** 2026-03-05

---

## Active Decisions

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
