# Phase 4: Regulatory Knowledge Base (RAG) - Research

**Researched:** 2026-03-20
**Domain:** pgvector RAG, OpenAI embeddings, Deno CLI ingestion, hybrid search
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema & Vector Store**
- pgvector already enabled; `regulatory_chunks` table created (Phase 1) — must be replaced/extended
- Unified `chunks` table with: `id`, `org_id`, `doc_type` (`regulatory` | `proposal`), `source`, `content`, `embedding`, `agency`, `guideline_type`, `therapeutic_area`, `tsvector` column
- `tsvector` column MUST be included at table creation time — not a later migration
- RLS enforced by `org_id` at row level on this table — no cross-tenant access under any circumstance

**Two Separate Ingestion Paths**
- Path 1 (regulatory, dev-run): PDFs in `/regulatory-docs` folder organized by agency/therapeutic area; CLI script only; loads subset matching org's configured agencies and therapeutic areas; no URL fetching or web crawling
- Path 2 (proposals, automated): background ingestion triggered on upload/creation; tagged to `org_id`; RLS enforces isolation (not application-level filtering)

**Retrieval Integration**
- Dedicated `retrieve-context` Edge Function — clean separation from generation logic
- Two namespaces per query: global regulatory pool (filtered to org scope) + org's private proposal history
- System prompt injection format (versioned):
  ```
  [REGULATORY CONTEXT]
  <relevant regulatory chunks>

  [PROPOSAL HISTORY]
  <relevant org proposal chunks>

  [INSTRUCTIONS]
  Answer strictly from the above context. When citing, distinguish between regulatory sources and proposal history.
  ```
- Prepended to system prompt as structured prefix — NOT injected into user message

**Retrieval Strategy**
- Hybrid search: pgvector similarity + Postgres full-text search in parallel; merged 70% vector / 30% keyword
- Pure vector similarity is not acceptable (compliance context — "E6" vs "E9" must not conflate)
- `RETRIEVAL_K_REGULATORY = 5`, `RETRIEVAL_K_PROPOSALS = 5` as named constants
- `RETRIEVAL_SIMILARITY_THRESHOLD = 0.65` as a named constant
- Explicit logging when retrieval falls below minimum chunk count — silent failures are not acceptable
- Org scope (`agencies`, `therapeutic_areas`) resolved at query time from org profile — not hardcoded

### Claude's Discretion
- Chunking implementation details (exact boundary detection logic, overlap handling)
- Embedding batch size and rate limiting strategy
- Error handling and retry logic for embedding API calls
- Specific CLI interface design (flags, output format) for the ingestion script

### Deferred Ideas (OUT OF SCOPE)
- Automated regulatory update monitoring (PMDA, NMPA, Health Canada, TGA)
- URL-based document fetching or web crawling
- Non-developer triggering of regulatory doc ingestion
- Per-section configurable K values
- A dedicated vector store service (Supabase pgvector is sufficient at current scale)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-7.7 | Regulatory knowledge base seeded: ICH E6(R2/R3), top 10 FDA clinical trial guidance, ICH E3, key EMA regulations | CLI ingestion script pattern; PDF text extraction reuses Phase 3 patterns |
| REQ-7.8 | Section-boundary chunking (400–600 tokens, 100-token overlap), OpenAI text-embedding-3-small, stored in pgvector | Token counting with tiktoken; OpenAI embeddings API batch pattern; pgvector insert |
| REQ-4.9 | RAG context: retrieve relevant regulatory chunks from pgvector and include in each generation call | `retrieve-context` Edge Function; hybrid search SQL; system prompt injection format |
</phase_requirements>

---

## Summary

Phase 4 seeds the regulatory knowledge base and wires RAG retrieval into the generation pipeline. The work divides cleanly into three areas: (1) a schema migration replacing `regulatory_chunks` with a unified `chunks` table, (2) a dev-run CLI ingestion script that chunks PDFs and embeds them via OpenAI, and (3) a `retrieve-context` Supabase Edge Function that runs hybrid vector + full-text search and returns formatted context.

All decisions are locked from the CONTEXT.md session. The existing `regulatory_chunks` table (Phase 1 migration 010) must be dropped and replaced — the schema is incompatible with the unified multi-tenant design. The existing `extract-document` Edge Function provides the exact deployment and Supabase client pattern to follow.

The critical complexity in this phase is the hybrid search merge logic and the schema migration — the rest follows established patterns from Phases 1–3.

**Primary recommendation:** Build in order: (1) migration, (2) CLI ingestion + seed run, (3) `retrieve-context` Edge Function, (4) integration test. The migration must land first because all other work depends on the table shape.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| OpenAI JS SDK | `npm:openai` latest | Text embeddings via `text-embedding-3-small` | Anthropic has no embedding API; this is the locked decision |
| pgvector (Supabase) | Already enabled | Vector similarity search (HNSW) | Already installed in project (extensions schema); no additional service |
| Supabase JS client | Already in project | DB reads/writes from Edge Function | Established pattern from Phases 1–3 |
| tiktoken | `npm:js-tiktoken` or `npm:tiktoken` | Token counting for chunk sizing | Standard for OpenAI token-accurate chunking |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pdf-parse / pdfjs | Already used in Phase 3 | PDF text extraction in CLI script | Reuse Phase 3 extraction logic for regulatory PDFs |
| Deno std/flags | Deno standard library | CLI argument parsing | CLI ingestion script flag handling |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| js-tiktoken (Deno-compatible) | tiktoken (native bindings) | Native tiktoken may not work in Deno; js-tiktoken is pure JS and Deno-safe |
| Inline Postgres full-text search | Elasticsearch/Algolia | Postgres FTS is native to Supabase — no additional service, correct for this scale |
| Cosine similarity (HNSW) | L2 / inner product | Cosine is standard for normalized text embeddings from OpenAI |

**Installation (CLI script, Deno):**
```bash
# No npm install needed — Deno imports inline
# deno run --allow-net --allow-read --allow-env scripts/ingest-regulatory.ts
```

---

## Architecture Patterns

### Recommended Project Structure

```
regulatory-docs/
├── ICH/
│   ├── E6_R2_GCP.pdf
│   ├── E6_R3_GCP.pdf
│   └── E3_CSR_Structure.pdf
├── FDA/
│   ├── clinical-trial-guidance-1.pdf
│   └── ... (top 10)
└── EMA/
    └── clinical-trial-regulations.pdf

scripts/
└── ingest-regulatory.ts     # Dev-run CLI ingestion script

supabase/
├── migrations/
│   └── 20260320000015_chunks_table.sql   # Drop regulatory_chunks, create chunks
└── functions/
    └── retrieve-context/
        ├── index.ts          # Hybrid search Edge Function
        └── deno.json
```

### Pattern 1: Section-Boundary Chunking

**What:** Split extracted PDF text at section headings (regex on numbered headings like "4.", "4.1", "ICH E6 Section"), then enforce 400–600 token size with 100-token overlap.
**When to use:** All regulatory document ingestion.

```typescript
// Chunking approach — Claude's discretion on exact implementation
const CHUNK_TARGET_TOKENS = 500   // midpoint of 400–600 range
const CHUNK_MAX_TOKENS = 600
const OVERLAP_TOKENS = 100

// Section boundary detection pattern for regulatory docs
const SECTION_HEADING_RE = /^(\d+\.[\d.]*)[\s\t]+[A-Z]/m

function chunkDocument(text: string, sectionRef?: string): Chunk[] {
  // 1. Split on section headings
  // 2. If segment > CHUNK_MAX_TOKENS, slide-window split with OVERLAP_TOKENS
  // 3. If segment < 400 tokens, merge with next segment
  // Track section_ref from last heading seen
}
```

### Pattern 2: OpenAI Embedding with Batching

**What:** Batch embed chunks to stay within API limits. text-embedding-3-small accepts up to 2048 inputs per call.
**When to use:** CLI ingestion script and proposal ingestion path.

```typescript
// Source: OpenAI Embeddings API docs
const EMBED_BATCH_SIZE = 100  // Conservative; max is 2048

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    encoding_format: 'float'
  })
  return response.data.map(d => d.embedding)
}

// Rate limiting: ~3000 RPM on tier 1; batch + 100ms delay between batches
```

### Pattern 3: Hybrid Search SQL

**What:** Run vector similarity and full-text search in parallel; merge with 70/30 weighting.
**When to use:** `retrieve-context` Edge Function for all retrieval.

```sql
-- Vector search component
SELECT id, content, source, agency, therapeutic_area, doc_type,
       1 - (embedding <=> $1::vector) AS vector_score
FROM chunks
WHERE org_id = $2
  AND doc_type = 'regulatory'
  AND agency = ANY($3::text[])
  AND therapeutic_area = ANY($4::text[])
  AND 1 - (embedding <=> $1::vector) >= $5
ORDER BY vector_score DESC
LIMIT $6;

-- Full-text search component
SELECT id, content, source, agency, therapeutic_area, doc_type,
       ts_rank(search_vector, plainto_tsquery('english', $7)) AS text_score
FROM chunks
WHERE org_id = $2
  AND doc_type = 'regulatory'
  AND agency = ANY($3::text[])
  AND therapeutic_area = ANY($4::text[])
  AND search_vector @@ plainto_tsquery('english', $7)
LIMIT $6;

-- Merge in application layer: final_score = 0.7 * vector_score + 0.3 * text_score
```

### Pattern 4: retrieve-context Edge Function Shape

```typescript
// retrieve-context/index.ts — follows extract-document pattern
interface RetrieveRequest {
  orgId: string
  query: string                    // proposal section text or user query
  therapeuticArea?: string         // passed from org config at query time
}

interface RetrieveResponse {
  regulatoryChunks: Chunk[]        // up to RETRIEVAL_K_REGULATORY
  proposalChunks: Chunk[]          // up to RETRIEVAL_K_PROPOSALS
  systemPromptBlock: string        // pre-formatted [REGULATORY CONTEXT]...[PROPOSAL HISTORY]... block
  retrievalMeta: {
    regulatoryCount: number
    proposalCount: number
    belowThreshold: boolean        // explicit flag if < min chunk count
  }
}
```

### Pattern 5: chunks Table Schema (Migration)

```sql
-- Drop old regulatory_chunks (Phase 1), create unified chunks table
DROP TABLE IF EXISTS regulatory_chunks;

CREATE TABLE chunks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type          TEXT NOT NULL CHECK (doc_type IN ('regulatory', 'proposal')),
  source            TEXT NOT NULL,       -- document name / proposal title
  content           TEXT NOT NULL,
  embedding         extensions.vector(1536),
  agency            TEXT,                -- 'ICH', 'FDA', 'EMA' — NULL for proposals
  guideline_type    TEXT,                -- e.g. 'GCP', 'CSR', 'endpoints'
  therapeutic_area  TEXT,
  search_vector     TSVECTOR,           -- MUST be at creation time per locked decision
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tsvector update trigger
CREATE TRIGGER chunks_search_vector_update
  BEFORE INSERT OR UPDATE ON chunks
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', content, source);

-- HNSW index — same parameters as Phase 1 (m=16, ef_construction=64)
CREATE INDEX idx_chunks_embedding
  ON chunks USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text index
CREATE INDEX idx_chunks_search_vector ON chunks USING gin(search_vector);

-- Composite index for org-scoped doc_type queries
CREATE INDEX idx_chunks_org_doctype ON chunks(org_id, doc_type);

-- RLS
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY chunks_org_isolation ON chunks
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));
```

### Anti-Patterns to Avoid

- **Inlining retrieval into the generation Edge Function:** Violates the clean separation decision; harder to test and tune independently.
- **Hardcoding agency/therapeutic_area filters per query:** Scope must come from org profile at query time — any hardcoding breaks future org config changes.
- **Inserting chunks without embedding first:** `embedding` column can be NULL but HNSW queries will silently skip NULL rows — always embed before insert.
- **Magic numbers for K and threshold:** All three config values (`RETRIEVAL_K_REGULATORY`, `RETRIEVAL_K_PROPOSALS`, `RETRIEVAL_SIMILARITY_THRESHOLD`) must be named constants at the top of the retrieval module.
- **Silent retrieval failure:** If count of returned chunks < 1, log explicitly — never pass an empty context block to generation silently.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Character count ÷ 4 heuristic | `js-tiktoken` with `cl100k_base` encoding | OpenAI uses BPE tokenization; character ratio is ±30% inaccurate for regulatory text with abbreviations |
| Embedding similarity | Cosine math in JS | pgvector `<=>` operator | pgvector operates in DB, avoids N×1536 data round-trips to application layer |
| Full-text search | String.includes() matching | Postgres `tsvector` / `tsquery` | FTS handles stemming, stop words, ranking — string match misses "monitoring" when query is "monitor" |
| Merge/dedup of hybrid results | Manual array diff | Score-merge by chunk ID | Chunks can appear in both result sets; must dedup by ID before applying weighted score |

---

## Common Pitfalls

### Pitfall 1: regulatory_chunks Table Conflict
**What goes wrong:** Phase 1 migration 010 created `regulatory_chunks` with a different schema. New migration must explicitly DROP the old table before CREATE TABLE chunks.
**Why it happens:** Schema mismatch — old table lacks `org_id`, `doc_type`, `tsvector`, `agency`, `therapeutic_area`.
**How to avoid:** Migration 015 opens with `DROP TABLE IF EXISTS regulatory_chunks;` — confirmed safe because no production data yet.
**Warning signs:** Foreign key errors or "column does not exist" on retrieval if the migration partially applied.

### Pitfall 2: Regulatory Docs Have No org_id (Old Design)
**What goes wrong:** Old `regulatory_chunks` was a shared table with no `org_id`. The new design requires `org_id` on every row for RLS. For regulatory docs, the pattern is: on org onboarding, seed that org's subset using the service role key from the CLI script — each regulatory chunk row gets the onboarding org's `org_id`.
**Why it happens:** Conflict between "global shared knowledge" and "RLS on org_id" designs.
**How to avoid:** CLI script takes `--org-id` flag; inserts all regulatory chunks with that org's ID. Each org gets their own copy of the relevant regulatory subset. Storage cost is acceptable at this scale.
**Warning signs:** RLS returning zero rows when querying as an authenticated user.

### Pitfall 3: pdfjs vs pdf-parse in Deno CLI Context
**What goes wrong:** Phase 3 uses pdfjs (not pdf-parse) in the Edge Function. The CLI script runs in Deno (not Supabase Edge), so the import path may differ.
**Why it happens:** Different Deno runtime environments (Edge Functions vs local Deno CLI) have different module resolution.
**How to avoid:** CLI script should use the same `pdfjs` import style confirmed working in Phase 3 Edge Function, or fall back to `npm:pdf-parse` with the lib path workaround. Prototype extraction on one PDF before processing all.
**Warning signs:** "Cannot resolve module" errors on first `deno run`.

### Pitfall 4: Embedding Dimension Mismatch
**What goes wrong:** text-embedding-3-small outputs 1536 dimensions. Phase 1 created the HNSW index with `extensions.vector(1536)`. If a future model is used or dimensions are misconfigured, inserts will fail.
**Why it happens:** pgvector enforces fixed dimension at column definition time.
**How to avoid:** Assert `embedding.length === 1536` before any DB insert in the CLI script.
**Warning signs:** "expected N dimensions, not M" Postgres error on insert.

### Pitfall 5: tsvector Not Populated on Existing Rows
**What goes wrong:** If chunks are inserted before the trigger is created (or trigger is created after bulk insert), `search_vector` will be NULL for those rows and FTS will return zero results.
**Why it happens:** Trigger only fires on INSERT/UPDATE after creation.
**How to avoid:** Migration creates trigger before any data insert. CLI script runs after migration. If backfilling is ever needed: `UPDATE chunks SET search_vector = to_tsvector('english', content || ' ' || source)`.
**Warning signs:** FTS component of hybrid search returns 0 results while vector search returns results.

### Pitfall 6: OpenAI Rate Limits on Bulk Ingestion
**What goes wrong:** Embedding ~hundreds of chunks from full regulatory library hits rate limits on lower OpenAI tiers (~3000 RPM, ~1M TPM on Tier 1).
**Why it happens:** Batch of 100 chunks × ~500 tokens = 50K tokens per batch; 20 batches = 1M tokens.
**How to avoid:** Add 100–200ms delay between batches. Implement exponential backoff on 429 errors. Log progress per batch.
**Warning signs:** `429 Too Many Requests` errors mid-ingestion.

---

## Code Examples

### Hybrid Search Merge (TypeScript)

```typescript
// Source: pattern derived from pgvector docs + Supabase query patterns
const RETRIEVAL_K_REGULATORY = 5
const RETRIEVAL_K_PROPOSALS = 5
const RETRIEVAL_SIMILARITY_THRESHOLD = 0.65

function mergeHybridResults(
  vectorResults: Array<{ id: string; content: string; vector_score: number }>,
  textResults: Array<{ id: string; content: string; text_score: number }>,
  k: number
): Array<{ id: string; content: string; final_score: number }> {
  const scores = new Map<string, { content: string; vector: number; text: number }>()

  for (const r of vectorResults) {
    scores.set(r.id, { content: r.content, vector: r.vector_score, text: 0 })
  }
  for (const r of textResults) {
    const existing = scores.get(r.id)
    if (existing) {
      existing.text = r.text_score
    } else {
      scores.set(r.id, { content: r.content, vector: 0, text: r.text_score })
    }
  }

  return Array.from(scores.entries())
    .map(([id, s]) => ({
      id,
      content: s.content,
      final_score: 0.7 * s.vector + 0.3 * s.text
    }))
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, k)
}
```

### System Prompt Block Assembly

```typescript
// Versioned format — treat as a contract
function buildSystemPromptBlock(
  regulatoryChunks: Chunk[],
  proposalChunks: Chunk[]
): string {
  const regSection = regulatoryChunks.length > 0
    ? regulatoryChunks.map(c => `[${c.source}] ${c.content}`).join('\n\n')
    : '(No relevant regulatory context found)'

  const propSection = proposalChunks.length > 0
    ? proposalChunks.map(c => `[${c.source}] ${c.content}`).join('\n\n')
    : '(No relevant proposal history found)'

  return `[REGULATORY CONTEXT]\n${regSection}\n\n[PROPOSAL HISTORY]\n${propSection}\n\n[INSTRUCTIONS]\nAnswer strictly from the above context. When citing, distinguish between regulatory sources and proposal history.`
}
```

### CLI Ingestion Script Skeleton

```typescript
// scripts/ingest-regulatory.ts
// Usage: deno run --allow-net --allow-read --allow-env scripts/ingest-regulatory.ts \
//   --org-id=<uuid> --agency=ICH --dir=./regulatory-docs/ICH

const EMBED_BATCH_SIZE = 100
const BATCH_DELAY_MS = 150

// 1. Parse flags (--org-id, --agency, --dir, --dry-run)
// 2. Walk PDF files in --dir
// 3. Extract text (reuse pdfjs pattern from extract-document)
// 4. Chunk with section-boundary logic
// 5. Assert chunk token counts (400–600 target, 600 max)
// 6. Embed in batches of EMBED_BATCH_SIZE with delay + retry on 429
// 7. Assert embedding.length === 1536 before insert
// 8. Bulk insert into chunks table via Supabase service role client
// 9. Log progress and final counts
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| IVFFlat index | HNSW index | pgvector 0.5+ (2023) | HNSW builds on empty table, no training data needed — already in Phase 1 migration |
| Separate vector DB (Pinecone, Weaviate) | pgvector in Postgres | 2023–2024 | Eliminates additional service; Supabase ships pgvector natively |
| Pure vector search | Hybrid vector + keyword | 2024 best practice | Keyword search handles exact citations; pure semantic fails on "E6 Section 4.1" queries |
| text-embedding-ada-002 | text-embedding-3-small | Jan 2024 | Smaller, cheaper, better performance; 1536 dimensions same as ada-002 |

---

## Open Questions

1. **Org ID for regulatory chunks during initial seeding**
   - What we know: Regulatory chunks need `org_id` for RLS, but regulatory docs are global knowledge.
   - What's unclear: Is there a "bootstrap" org or do regulatory chunks get inserted once per org during onboarding?
   - Recommendation: CLI script takes explicit `--org-id` flag; developer seeds one org at a time. Document this in CLI help text. This is the correct interpretation of the locked decision: "loads only the subset of docs matching that org's configured agencies."

2. **Proposal ingestion trigger mechanism**
   - What we know: Phase 3 established fire-and-forget trigger from FileUpload component.
   - What's unclear: Does proposal ingestion trigger from the same `extract-document` Edge Function (extended) or a new `ingest-proposal` Edge Function?
   - Recommendation: New `ingest-proposal` Edge Function — keeps extraction and embedding/chunking concerns separate, and the planner can decide whether to include it in Phase 4 or Phase 7.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 |
| Config file | `vite.config.ts` (vitest config inline) |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-7.8 | Chunking produces 400–600 token chunks with 100-token overlap | unit | `npm run test:run -- src/lib/chunker.test.ts` | Wave 0 |
| REQ-7.8 | Embedding batch returns 1536-dimension vectors | unit (mock OpenAI) | `npm run test:run -- scripts/ingest.test.ts` | Wave 0 |
| REQ-4.9 | retrieve-context returns top-K regulatory chunks for sample query | integration (Deno test) | `deno test supabase/functions/retrieve-context/test.ts` | Wave 0 |
| REQ-4.9 | Hybrid merge weights correctly (70/30) | unit | `npm run test:run -- src/lib/retrieval.test.ts` | Wave 0 |
| REQ-7.7 | Regulatory docs present in chunks table after ingestion | smoke (manual) | CLI `--dry-run` flag + DB count check | manual |

### Sampling Rate
- **Per task commit:** `npm run test:run`
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/chunker.test.ts` — covers REQ-7.8 chunking logic
- [ ] `src/lib/retrieval.test.ts` — covers hybrid merge and score weighting
- [ ] `supabase/functions/retrieve-context/test.ts` — covers REQ-4.9 Edge Function

---

## Sources

### Primary (HIGH confidence)
- Project CONTEXT.md — all locked decisions, schema, retrieval strategy
- `supabase/migrations/20260305000010_regulatory_chunks.sql` — existing table to be replaced
- `supabase/functions/extract-document/index.ts` — Edge Function pattern to follow
- `.planning/STATE.md` — pgvector column notation, HNSW decision, embedding model decision

### Secondary (MEDIUM confidence)
- OpenAI text-embedding-3-small: 1536 dimensions, `cl100k_base` tokenizer, batch limit 2048 inputs — consistent with OpenAI docs and STATE.md
- pgvector HNSW: `m=16, ef_construction=64` parameters already in production migration — validated

### Tertiary (LOW confidence)
- js-tiktoken Deno compatibility — assumed based on pure-JS nature; prototype before committing to it

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all key library choices locked in CONTEXT.md and STATE.md
- Architecture: HIGH — schema, Edge Function shape, hybrid search pattern fully specified in locked decisions
- Pitfalls: HIGH — table migration conflict and org_id seeding question are concrete, project-specific issues derived from reviewing the actual migration file

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable APIs; pgvector and OpenAI embeddings are stable)
