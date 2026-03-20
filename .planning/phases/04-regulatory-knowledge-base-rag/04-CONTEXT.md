# Phase 4: Regulatory Knowledge Base (RAG) - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Seed the regulatory knowledge base into pgvector and wire RAG retrieval into the generation pipeline. No user-facing UI in this phase — this is backend infrastructure only. Deliverables are: (1) a dev-run CLI ingestion script for regulatory docs, (2) an automated ingestion path for proposals, and (3) a `retrieve-context` Edge Function that the generation pipeline will call.

</domain>

<decisions>
## Implementation Decisions

### Schema & Vector Store

- pgvector is already enabled and `regulatory_chunks` table created (Phase 1)
- Rename/extend table to a unified `chunks` table with: `id`, `org_id`, `doc_type` (`regulatory` | `proposal`), `source`, `content`, `embedding`, `agency`, `guideline_type`, `therapeutic_area`, `tsvector` column for Postgres full-text search
- The `tsvector` column must be included at table creation time — not a later migration
- RLS enforced by `org_id` at the row level on this table, matching all existing RLS policies — no cross-tenant data access under any circumstance

### Two Separate Ingestion Paths

**Path 1 — Regulatory Docs (dev-run, manual):**
- Regulatory PDFs (ICH E6(R2/R3), top 10 FDA clinical trial guidance, ICH E3, key EMA regulations) stored in `/regulatory-docs` folder in the repo, organized by agency and therapeutic area
- Ingestion is a dev-run CLI script — not user-triggered, not an Edge Function
- At org onboarding, the script loads only the subset of docs matching that org's configured agencies and therapeutic areas into their scoped namespace
- No URL fetching, live scraping, or web crawling — PDFs are manually curated and committed

**Path 2 — Proposals (automated, user-triggered):**
- When a CRO uploads or creates a proposal, ingestion runs automatically as a background process
- Proposals are chunked, embedded, and stored tagged to the org's `org_id`
- A proposal belonging to Org A must never appear in retrieval results for Org B — enforced by RLS, not application-level filtering

### Retrieval Integration

- A dedicated `retrieve-context` Edge Function handles all retrieval — clean separation from generation logic
- The generation pipeline calls this function; retrieval is not inlined into the generation Edge Function
- Retrieval hits **two namespaces per query**: the global regulatory doc pool (filtered to org scope) and that org's private proposal history
- Never query across org boundaries

**System prompt injection format (versioned design decision):**
```
[REGULATORY CONTEXT]
<relevant regulatory chunks>

[PROPOSAL HISTORY]
<relevant org proposal chunks>

[INSTRUCTIONS]
Answer strictly from the above context. When citing, distinguish between regulatory sources and proposal history.
```
- This block is prepended to the system prompt as a structured prefix — not injected into the user message
- Treats retrieved content as authoritative ground truth; enables source attribution in responses
- The structure and ordering of this prefix must be treated as a versioned, tested design decision

### Retrieval Strategy

**Hybrid search (vector + full-text):**
- Run pgvector similarity and Postgres full-text search queries in parallel against the chunks table
- Merge results with weighted score: **70% vector / 30% keyword**
- Pure vector similarity alone is not acceptable — CRO users routinely query by exact regulatory citations (e.g. "ICH E6 Section 4.1", "21 CFR Part 11"). Semantically similar strings like "E6" and "E9" can score closely but refer to entirely different guidelines — unacceptable in a compliance context
- Both pgvector and full-text search are native to Postgres/Supabase — no additional service required

**K value:**
- `RETRIEVAL_K_REGULATORY = 5` and `RETRIEVAL_K_PROPOSALS = 5` as named config variables at the top of the retrieval module
- No per-section conditional logic yet — just make it trivially easy to change without a refactor

**Similarity threshold:**
- `RETRIEVAL_SIMILARITY_THRESHOLD = 0.65` as a named config variable
- Explicit logging when retrieval falls below minimum chunk count — failures must never be silent

**Org-scoped metadata filtering:**
- Org's configured scope (agencies, therapeutic areas) resolved at query time from their org profile — not hardcoded per query
- Pattern: `WHERE agency = ANY(org_config.agencies) AND therapeutic_area = ANY(org_config.therapeutic_areas)`
- This ensures scope automatically reflects any future org configuration changes without pipeline modifications

### Claude's Discretion

- Chunking implementation details (exact boundary detection logic, overlap handling)
- Embedding batch size and rate limiting strategy
- Error handling and retry logic for embedding API calls
- Specific CLI interface design (flags, output format) for the ingestion script

</decisions>

<specifics>
## Specific Ideas

- The system prompt injection structure `[REGULATORY CONTEXT] / [PROPOSAL HISTORY] / [INSTRUCTIONS]` is explicitly a versioned design decision — treat it like a contract, not an implementation detail
- The 70/30 vector/keyword weighting is a starting point — should be easy to tune
- `RETRIEVAL_K_REGULATORY`, `RETRIEVAL_K_PROPOSALS`, and `RETRIEVAL_SIMILARITY_THRESHOLD` should all be named constants at the top of the retrieval module, not magic numbers

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/supabase.ts`: Supabase client — retrieval Edge Function will use the same client pattern
- `supabase/functions/extract-document/`: Existing Edge Function — retrieval Edge Function follows the same deployment pattern
- `cro-proposal-generator.js`: Existing Anthropic API integration — generation pipeline will call `retrieve-context` before building the prompt

### Established Patterns
- Edge Functions: Deno-based, deployed to Supabase — `retrieve-context` follows this pattern
- RLS: All existing tables enforce `org_id` row-level security — chunks table must match
- Background processing: Phase 3 established the pattern of async document extraction triggered on upload — proposal ingestion path follows the same trigger pattern

### Integration Points
- `retrieve-context` Edge Function will be called by the Phase 7 generation pipeline
- Proposal ingestion triggers off the same upload/creation events wired in Phase 3
- Org config (agencies, therapeutic areas) comes from the org profile table (established in Phase 1)

</code_context>

<deferred>
## Deferred Ideas

- Automated regulatory update monitoring (PMDA, NMPA, Health Canada, TGA) — explicitly out of MVP scope
- URL-based document fetching or web crawling — explicitly out of MVP scope
- Non-developer triggering of regulatory doc ingestion — out of MVP scope
- Per-section configurable K values — deferred until tuning data exists
- A dedicated vector store service (Supabase pgvector is sufficient at current scale)

</deferred>

---

*Phase: 04-regulatory-knowledge-base-rag*
*Context gathered: 2026-03-20*
