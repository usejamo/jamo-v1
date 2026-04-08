# Phase 7: Proposal Generation Engine - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Live, streaming, section-by-section proposal generation via Anthropic API. Delivers: a `generate-proposal-section` Edge Function, a client-side orchestrator that manages section sequencing and consistency anchor, SSE streaming display in `ProposalDraftRenderer`, and completed sections persisted to `proposal_sections` in Supabase.

Not in scope: rich text editing (Phase 8), Jamo AI chat (Phase 9), DOCX export.

</domain>

<decisions>
## Implementation Decisions

### Section Sequencing
- **D-01:** Generation follows a **foundation-first, three-wave sequence**:
  - Wave 1 (anchor): `Understanding of the Study` — generates first; its output seeds the consistency anchor
  - Wave 2 (parallel body): `Scope of Work`, `Proposed Team`, `Timeline & Milestones`, `Budget Overview`, `Regulatory Strategy`, `Quality Management` — generate in parallel after Wave 1 completes
  - Wave 3 (summary): `Executive Summary`, `Cover Letter` — generate last, after all body sections complete (they summarize everything)
- **D-02:** The client-side orchestrator manages this wave logic — it knows section-to-wave assignment and fires Wave 2 sections simultaneously after Wave 1 settles.

### Streaming Display (Phase 7 rendering)
- **D-03:** Extend `ProposalDraftRenderer` with per-section streaming cards. Each card shows:
  - A live text buffer while the section is streaming (SSE → React state)
  - Status indicator: `queued` / `generating...` / `waiting for body sections` / `complete`
  - Snaps to final content when the section stream closes
- **D-04:** Phase 8 replaces these cards with full TipTap editor blocks. Phase 7 does NOT build TipTap — only the streaming card layout.

### Generation Model
- **D-05:** Main section generation uses `claude-sonnet-4-6` (Sonnet 4.6).
- **D-06:** Consistency anchor extraction uses Haiku-tier (`claude-haiku-4-5-20251001`). The anchor is a ~500-token summary extracted after each section completes, passed to subsequent section calls.

### Edge Function Input Contract
- **D-07:** `generate-proposal-section` receives the **full payload from the client**:
  ```
  POST /generate-proposal-section
  {
    proposalId,
    sectionId,
    proposalInput: { studyInfo, assumptions, services },
    ragChunks: [...],
    consistencyAnchor: "...",
    tone: "formal" | "regulatory" | "persuasive"
  }
  ```
- **D-08:** The Edge Function is **stateless** — it does not fetch from DB. It receives everything, calls Anthropic with streaming, pipes SSE to the browser response, and on stream close writes the completed section text to `proposal_sections`.
- **D-09:** The client orchestrator owns all assembly: fetches assumptions from `proposal_assumptions`, calls `retrieve-context` for RAG chunks, maintains and passes the consistency anchor between waves.

### Claude's Discretion
- Exact prompt structure per section (how `proposalInput`, `ragChunks`, and `consistencyAnchor` are assembled into the Anthropic message) — use `cro-proposal-generator.js` system prompt as the base, adapt per section.
- `[PLACEHOLDER: ...]` marker format and insertion logic.
- Supabase Realtime subscription approach for frontend section updates.
- Error recovery for failed section streams (retry logic, failed state in card).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing generation prompt
- `cro-proposal-generator.js` — System prompt and user message builder for CRO proposal generation. Defines all section names, order, and content expectations. Use as the prompt foundation for Phase 7.

### Existing Edge Function pattern
- `supabase/functions/extract-assumptions/index.ts` — Establishes Deno Edge Function conventions: `serve()` handler, CORS, supabase client init, Anthropic API call pattern, error handling shape.

### RAG retrieval
- `supabase/functions/retrieve-context/` — Existing RAG retrieval function. Client calls this to get RAG chunks before calling `generate-proposal-section`.

### Schema
- `supabase/migrations/` — `proposal_sections` and `proposal_assumptions` table definitions. Phase 7 writes to `proposal_sections` on stream close.

### Type contracts
- `src/types/wizard.ts` (if exists) — `ProposalInput` struct definition from Phase 5/6. Phase 7's payload is derived from this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cro-proposal-generator.js`: System prompt is production-quality and covers all 10 sections. Phase 7 should import/adapt this rather than rewriting from scratch.
- `supabase/functions/extract-assumptions/index.ts`: Copy the CORS, serve(), error handling, and Anthropic client setup as the starting template for `generate-proposal-section`.
- `supabase/functions/retrieve-context/`: Call this from the client orchestrator to get RAG chunks per section.
- `src/components/ProposalDraftRenderer.tsx`: Current read-only renderer — Phase 7 extends this with streaming card state. Do not replace it; augment it.

### Established Patterns
- Edge Functions use Deno + `supabase` import map (`import { createClient } from 'supabase'`).
- Anthropic calls use `fetch()` directly (native in Deno) — see `cro-proposal-generator.js`.
- React state management uses `useReducer` (established in wizard, Phase 5).
- Tailwind CSS for all styling.

### Integration Points
- Wizard Step 4 ("Generate" trigger) → fires the client orchestrator → `generate-proposal-section` Edge Function.
- `ProposalDraftRenderer` is rendered inside `ProposalDetail` — the streaming card extension lands there.
- `proposal_sections` table receives completed section text on stream close.
- `proposal_assumptions` table is the source for `assumptions` in `ProposalInput` (read by client orchestrator before firing generation).

</code_context>

<specifics>
## Specific Ideas

- Three-wave orchestration was explicitly chosen: Understanding first as the factual anchor, body sections in parallel, summary sections last. This is a specific architectural decision — not just "dependency order."
- The client orchestrator manages wave sequencing, not the Edge Function. Edge Function is deliberately kept stateless and simple.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-proposal-generation-engine*
*Context gathered: 2026-03-24*
