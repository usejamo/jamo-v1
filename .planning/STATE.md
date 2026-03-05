# STATE.md — Project Memory

**Last updated:** 2026-03-05
**Current milestone:** Milestone 1 — MVP
**Current phase:** None started — ready to begin Phase 1

---

## Project Status

| Item | Status |
|------|--------|
| PROJECT.md | Complete |
| REQUIREMENTS.md | Complete |
| ROADMAP.md | Complete (13 phases) |
| Codebase map | Complete (.planning/codebase/) |
| Research | Complete (.planning/research/) |
| Phase execution | Not started |

---

## Next Action

Run `/gsd:plan-phase 1` to plan the Supabase Foundation phase.

---

## Active Decisions

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

## Completed Phases

None yet.

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
