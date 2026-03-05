# Backend Research: Jamo CRO Proposal Intelligence Platform

**Researched:** 2026-03-05
**Researcher:** GSD Research Agent
**Scope:** Supabase Edge Functions, document parsing (Deno), pgvector RAG, multi-tenant RLS

> **Confidence note:** Web search and WebFetch are restricted in this environment.
> All findings below are drawn from training data (knowledge cutoff ~August 2025) on
> Supabase, Deno, pgvector, and Anthropic APIs. Confidence levels are assigned per
> finding. High-confidence claims are stable, well-documented platform behaviors.
> Flag any MEDIUM/LOW items for verification against current Supabase docs before
> implementation.

---

## 1. Supabase Edge Functions for AI Workloads

### 1.1 How Edge Functions Work

Supabase Edge Functions run on Deno Deploy (Deno runtime, not Node.js). Each function
is a TypeScript/JavaScript file deployed to Supabase's edge network. They are invoked
via HTTP, either from the client (using `supabase.functions.invoke()` or raw fetch) or
from a Postgres trigger/webhook.

Key characteristics:
- **Runtime:** Deno (not Node.js). npm packages are NOT importable directly.
  Use `npm:` specifiers (Deno's npm compat layer) or `esm.sh` CDN imports for
  npm packages.
- **Invocation:** HTTP POST to `https://<project-ref>.supabase.co/functions/v1/<fn-name>`
- **Auth:** JWT from Supabase Auth is automatically validated if `Authorization`
  header is sent. Access `supabase.auth.getUser()` inside the function.
- **Environment variables:** Set per-project via the Supabase dashboard or CLI.
  `ANTHROPIC_API_KEY` stored here — never in frontend code.

**Confidence: HIGH** — stable, well-documented behavior.

### 1.2 Timeout and Size Limits

| Limit | Free Tier | Pro Tier | Notes |
|-------|-----------|----------|-------|
| Wall-clock timeout | 150 seconds | 150 seconds | Hard limit; cannot be extended |
| CPU time limit | 2 seconds (soft) | 2 seconds (soft) | Actual CPU exec, not wall time |
| Request body size | 6 MB | 6 MB | Enforced at the edge |
| Response size | Unbounded (streaming) | Unbounded (streaming) | Streaming bypasses response size |
| Memory | 256 MB | 256 MB | Per invocation |

**Confidence: MEDIUM** — these limits were accurate as of mid-2025. Supabase has been
actively raising limits; verify current limits at
https://supabase.com/docs/guides/functions/limits before building.

**Critical implication for Jamo:** At 32,000 max_tokens, a full CRO proposal
generation will take 60-120 seconds of wall time. This is within the 150-second
limit but dangerously close. Section-by-section generation (already in
`cro-proposal-generator.js`) is the right architectural choice — each section
call at 8,000 max_tokens should complete in 15-30 seconds, well within limits.

**Document upload constraint:** 6 MB request body limit means large PDF uploads
cannot be sent directly to an Edge Function body. Files must be uploaded to
Supabase Storage first, then the Edge Function reads from storage by path.
Do NOT attempt to base64-encode files into Edge Function request bodies.

### 1.3 Streaming Responses from Anthropic

Supabase Edge Functions support streaming responses using the WHATWG Streams API
(ReadableStream, TransformStream). This is native to Deno and works well.

**Pattern for proxying Anthropic streaming to the browser:**

```typescript
// supabase/functions/generate-section/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  const { sectionId, proposalInput } = await req.json();

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      stream: true,                          // Enable SSE streaming
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(proposalInput) }],
    }),
  });

  // Pipe Anthropic's SSE stream directly to browser
  return new Response(anthropicResponse.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      // Required for Supabase CORS
      "Access-Control-Allow-Origin": "*",
    },
  });
});
```

**On the frontend (React), consume the stream:**

```typescript
const response = await supabase.functions.invoke('generate-section', {
  body: { sectionId, proposalInput },
});
// supabase.functions.invoke() does NOT support streaming — use raw fetch instead
```

**Important gotcha:** `supabase.functions.invoke()` buffers the entire response body
before returning. For streaming, call the Edge Function URL directly with `fetch()`:

```typescript
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-section`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sectionId, proposalInput }),
  }
);

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Parse SSE: "data: {...}\n\n"
  // Update React state with accumulated text
}
```

**Confidence: HIGH** — Deno's native streaming + Anthropic SSE streaming is a
well-established pattern.

### 1.4 Best Patterns for Long-Running AI Tasks

**Option A: Direct streaming (recommended for MVP)**
- Client calls Edge Function → Edge Function calls Anthropic with `stream: true` →
  pipe stream back to client.
- Works within the 150-second timeout for section-by-section generation.
- Simple, no extra infrastructure.

**Option B: Async job queue (recommended for full-proposal generation)**
For generating all 11 sections sequentially (total ~3-5 minutes), streaming won't work
within the timeout. Use a job queue pattern:

1. Client calls `POST /functions/v1/start-proposal-generation` → function creates a
   `generation_jobs` row in Postgres with `status = 'pending'`, returns `job_id`.
2. A second Edge Function is invoked via a Postgres trigger (or pg_net / Supabase
   Realtime + cron) and processes sections one by one, writing each completed section
   to a `proposal_sections` table.
3. Client subscribes to Realtime on `proposal_sections` where `proposal_id = <id>`
   and receives each section as it completes.
4. UI renders sections progressively as they arrive.

This is the correct architecture for full-proposal generation and aligns perfectly
with the existing section-by-section design in `cro-proposal-generator.js`.

**Supabase Realtime subscription pattern (React):**

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`proposal:${proposalId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'proposal_sections',
        filter: `proposal_id=eq.${proposalId}`,
      },
      (payload) => {
        // New section arrived — update UI
        setSections((prev) => [...prev, payload.new]);
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [proposalId]);
```

**Confidence: HIGH** — Realtime + progressive section rendering is a standard
Supabase pattern.

---

## 2. Document Parsing in Supabase (Deno Runtime)

### 2.1 The Deno Constraint

Edge Functions run on Deno, which has no native Node.js `Buffer`, no native `fs`,
and cannot install npm packages via `npm install`. Available options:
1. **npm: specifiers** — Deno's npm compatibility layer (e.g., `import pdf from "npm:pdf-parse"`)
2. **esm.sh** — CDN that converts npm packages to ESM for Deno (e.g., `import pdf from "https://esm.sh/pdf-parse"`)
3. **Pure Deno/WebAssembly libraries** — native Deno packages from deno.land/x or jsr.io

Not all npm packages work via these mechanisms. Packages that rely on native Node.js
bindings (e.g., `canvas`, some PDF renderers) will fail.

### 2.2 PDF Text Extraction

**Recommended: pdf-parse via esm.sh or npm: specifier**

```typescript
import pdfParse from "npm:pdf-parse";
// OR
import pdfParse from "https://esm.sh/pdf-parse@1.1.1";

// Read file buffer from Supabase Storage
const { data: fileData, error } = await supabaseAdmin.storage
  .from("uploaded-documents")
  .download(filePath);

const arrayBuffer = await fileData.arrayBuffer();
const buffer = new Uint8Array(arrayBuffer);
const pdfData = await pdfParse(buffer);

const extractedText = pdfData.text;   // Plain text content
const pageCount = pdfData.numpages;
```

**Known limitation:** `pdf-parse` is designed for Node.js and the `npm:` compatibility
layer may have edge cases with Deno. It works for the majority of digital PDFs but
can fail on malformed or encrypted PDFs.

**Alternative: pdfjs-dist (Mozilla PDF.js)**
More robust, actively maintained, has a Deno-compatible path:

```typescript
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@3.11.174/build/pdf.js";

// No worker needed in server-side context
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
const pdf = await loadingTask.promise;

let fullText = "";
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const textContent = await page.getTextContent();
  fullText += textContent.items.map((item) => item.str).join(" ") + "\n";
}
```

**Recommendation:** Use `pdfjs-dist` for robustness. Verify the specific esm.sh
version works in Deno before committing.

**Confidence: MEDIUM** — pdf parsing in Deno is known-workable but version-dependent.
Test early in development.

### 2.3 DOCX Text Extraction

**Recommended: mammoth.js**

mammoth converts DOCX to plain text or HTML. Works well in Deno via npm compat:

```typescript
import mammoth from "npm:mammoth";
// OR
import mammoth from "https://esm.sh/mammoth@1.7.0";

const { data: fileData } = await supabaseAdmin.storage
  .from("uploaded-documents")
  .download(filePath);

const arrayBuffer = await fileData.arrayBuffer();
const result = await mammoth.extractRawText({ arrayBuffer });
const extractedText = result.value;  // Plain text
```

mammoth has no native binding dependencies and has been confirmed working in
Deno-compatible runtimes. It preserves paragraph structure but strips formatting.

**Alternative for styled output: docx-parser or docx4js**
Not recommended for MVP — mammoth is simpler and sufficient.

**Confidence: HIGH** — mammoth is widely used in server-side JS environments and
has no problematic dependencies.

### 2.4 XLSX Parsing

For budget spreadsheets:

```typescript
import * as XLSX from "npm:xlsx";
// OR
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const workbook = XLSX.read(uint8Array, { type: "array" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);
```

**Confidence: HIGH** — SheetJS (xlsx) is the standard and works via npm compat.

### 2.5 Supabase Storage: Upload → Parse Pipeline

**Recommended upload flow:**

```
[Browser] → upload file to Supabase Storage (direct from client)
         → call Edge Function with file path + metadata
         → Edge Function downloads from Storage → extracts text
         → stores extracted text in `document_extracts` table
         → updates document record status = 'parsed'
```

**Client-side upload (direct to Storage — bypasses Edge Function size limit):**

```typescript
const { data, error } = await supabase.storage
  .from("uploaded-documents")
  .upload(`${orgId}/${proposalId}/${fileName}`, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
// data.path is the storage path to pass to Edge Function
```

**Storage bucket RLS policy:**

```sql
-- Users can upload to their own org's folder
CREATE POLICY "org_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'uploaded-documents'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM user_profiles WHERE user_id = auth.uid()
    )
  );

-- Users can only read files from their own org
CREATE POLICY "org_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'uploaded-documents'
    AND (storage.foldername(name))[1] = (
      SELECT org_id::text FROM user_profiles WHERE user_id = auth.uid()
    )
  );
```

**Edge Function reads from Storage using service role key:**

```typescript
import { createClient } from "npm:@supabase/supabase-js";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!  // Bypasses RLS for server-side ops
);

const { data: fileBlob } = await supabaseAdmin.storage
  .from("uploaded-documents")
  .download(filePath);
```

**Why service role in Edge Function:** RLS on storage objects scopes reads to the
authenticated user. The Edge Function authenticates as the user via the incoming JWT,
but using the service role key is simpler and correct since the function has already
validated the user's access rights before downloading.

**Confidence: HIGH** — this is the canonical Supabase pattern.

### 2.6 Post-Parse Storage in Database

Store extracted text in a `document_extracts` table (separate from raw file metadata):

```sql
CREATE TABLE document_extracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID REFERENCES documents(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  content       TEXT NOT NULL,           -- full extracted text
  page_count    INTEGER,
  word_count    INTEGER,
  parsed_at     TIMESTAMPTZ DEFAULT NOW(),
  parse_error   TEXT                     -- null if successful
);
```

This separates file metadata from content, makes chunking for RAG straightforward,
and allows re-parsing if the extraction logic improves.

---

## 3. RAG with Supabase pgvector

### 3.1 Enabling pgvector

pgvector is available on all Supabase projects (Postgres extension). Enable it:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This adds the `vector` type and operators (`<->` cosine distance, `<#>` negative
inner product, `<=>` L2 distance).

**Confidence: HIGH** — pgvector ships with Supabase Postgres by default.

### 3.2 Embedding Model Choice

**Recommended: OpenAI text-embedding-3-small (1536 dimensions)**

Reasons:
- Well-known, widely benchmarked, good balance of cost vs. quality
- 1536 dimensions is manageable for pgvector indexing
- ~$0.02 per 1M tokens — very cheap for a knowledge base of ICH/FDA documents

**Alternative: Anthropic — no native embedding model**
Anthropic does not offer an embedding API. Do not attempt to use Claude for
embeddings. Use OpenAI or an open-source model.

**Alternative: text-embedding-3-large (3072 dimensions)**
Higher quality but 2x cost and slower. Not necessary for regulatory document
retrieval where documents are structured and vocabulary is consistent.

**Alternative: Supabase AI with gte-small (384 dimensions)**
Supabase provides a local embedding option via their AI Inference API using
`gte-small`. Lower cost (no OpenAI bill), but lower quality than OpenAI models.
Acceptable for internal knowledge bases with consistent vocabulary.

**Recommendation:** Use OpenAI `text-embedding-3-small` for MVP. The OpenAI
cost for embedding an entire ICH/FDA library (~100 documents, ~5M tokens total)
is approximately $0.10. Effectively free.

**Confidence: HIGH** — OpenAI embeddings with pgvector is the canonical Supabase
RAG stack.

### 3.3 Table Schema for Vector Store

```sql
-- Regulatory knowledge base (pre-loaded by admin, not per-org)
CREATE TABLE regulatory_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name TEXT NOT NULL,           -- e.g., "ICH E6(R2) GCP Guidelines"
  document_type TEXT NOT NULL,           -- e.g., "ICH", "FDA", "EMA"
  section_ref   TEXT,                    -- e.g., "Section 5.18.3"
  content       TEXT NOT NULL,           -- chunk text
  embedding     vector(1536),            -- OpenAI text-embedding-3-small
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for approximate nearest neighbor search (required for performance)
CREATE INDEX ON regulatory_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
-- Use lists ≈ sqrt(row_count). For 10,000 chunks: lists = 100.

-- Per-proposal document chunks (org-scoped)
CREATE TABLE proposal_document_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  document_id   UUID NOT NULL REFERENCES documents(id),
  proposal_id   UUID REFERENCES proposals(id),
  content       TEXT NOT NULL,
  embedding     vector(1536),
  chunk_index   INTEGER NOT NULL,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON proposal_document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Enable RLS on proposal_document_chunks
ALTER TABLE proposal_document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON proposal_document_chunks
  FOR ALL TO authenticated
  USING (org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));
```

**Note on HNSW vs IVFFlat:** pgvector ≥ 0.5.0 supports HNSW indexes which are
faster and don't require a training phase. If your Supabase project is running
pgvector ≥ 0.5, prefer HNSW:

```sql
CREATE INDEX ON regulatory_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Confidence: HIGH** — pgvector schema patterns are well established.

### 3.4 Chunking Strategy for Regulatory Documents

Regulatory documents (ICH E6, FDA guidances) have specific structure: numbered
sections, subsections, tables, and definitions. Generic fixed-size chunking destroys
this structure.

**Recommended: Hierarchical chunking with section boundary awareness**

1. **Primary split:** Split at section headings (regex match on numbered headers:
   `\d+\.\d*\s+[A-Z]` or document-specific patterns).
2. **Secondary split:** If a section exceeds 800 tokens, split on paragraph boundaries
   (`\n\n`), not mid-sentence.
3. **Minimum chunk size:** 100 tokens — discard stubs.
4. **Overlap:** 100-token overlap between consecutive chunks from the same section
   to preserve context across chunk boundaries.
5. **Metadata tagging per chunk:** document name, section number, section title —
   this allows filtering by regulation type at query time.

**Target chunk size:** 400–600 tokens. At 1536 embedding dimensions, this gives
good retrieval precision without overwhelming the generation context.

**Do NOT use:** Fixed 512-character splits. They cut mid-sentence in legal/regulatory
text, producing incoherent chunks that confuse retrieval.

**Confidence: MEDIUM** — chunking strategy is empirical and should be validated
with test queries against real ICH/FDA documents. Plan a test round before
committing to chunk sizes.

### 3.5 Embedding and Ingestion Pipeline (Edge Function)

```typescript
// supabase/functions/ingest-document/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  const { documentId, chunks } = await req.json();

  // Embed all chunks in parallel (OpenAI allows batch embedding)
  const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: chunks.map((c) => c.content),  // Array of strings
    }),
  });

  const embedData = await embeddingResponse.json();
  const embeddings = embedData.data.map((d) => d.embedding);

  // Insert chunks + embeddings into Postgres
  const rows = chunks.map((chunk, i) => ({
    document_id: documentId,
    content: chunk.content,
    embedding: JSON.stringify(embeddings[i]),  // pgvector accepts JSON array
    chunk_index: i,
    metadata: chunk.metadata,
  }));

  const { error } = await supabaseAdmin
    .from("proposal_document_chunks")
    .insert(rows);

  return new Response(JSON.stringify({ success: !error, error }));
});
```

**OpenAI embedding batch limit:** 2048 strings per request. For very large documents,
batch in groups of 100 chunks.

**Confidence: HIGH** — OpenAI batch embedding + Supabase insert is straightforward.

### 3.6 Retrieval During Proposal Generation

**Retrieval SQL function (call from Edge Function):**

```sql
CREATE OR REPLACE FUNCTION match_regulatory_chunks(
  query_embedding vector(1536),
  match_count      INT DEFAULT 5,
  doc_type_filter  TEXT DEFAULT NULL   -- e.g., 'ICH', 'FDA'
)
RETURNS TABLE (
  id            UUID,
  document_name TEXT,
  section_ref   TEXT,
  content       TEXT,
  similarity    FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id,
    rc.document_name,
    rc.section_ref,
    rc.content,
    1 - (rc.embedding <-> query_embedding) AS similarity
  FROM regulatory_chunks rc
  WHERE
    (doc_type_filter IS NULL OR rc.document_type = doc_type_filter)
  ORDER BY rc.embedding <-> query_embedding
  LIMIT match_count;
END;
$$;
```

**Call from Edge Function:**

```typescript
// 1. Embed the query
const queryEmbedding = await embedText(sectionTopic);  // calls OpenAI

// 2. Retrieve relevant regulatory chunks
const { data: regulatoryContext } = await supabaseAdmin.rpc(
  "match_regulatory_chunks",
  {
    query_embedding: queryEmbedding,
    match_count: 5,
    doc_type_filter: "ICH",
  }
);

// 3. Inject into Anthropic prompt
const regulatoryContext = regulatoryChunks
  .map((c) => `[${c.document_name} ${c.section_ref}]\n${c.content}`)
  .join("\n\n");

const prompt = `${userMessage}\n\n## RELEVANT REGULATORY CONTEXT\n${regulatoryContext}`;
```

**Also retrieve from uploaded proposal documents:**

```sql
CREATE OR REPLACE FUNCTION match_proposal_chunks(
  query_embedding vector(1536),
  p_org_id        UUID,
  p_proposal_id   UUID,
  match_count     INT DEFAULT 5
)
RETURNS TABLE (id UUID, content TEXT, document_name TEXT, similarity FLOAT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pdc.id,
    pdc.content,
    d.name AS document_name,
    1 - (pdc.embedding <-> query_embedding) AS similarity
  FROM proposal_document_chunks pdc
  JOIN documents d ON d.id = pdc.document_id
  WHERE
    pdc.org_id = p_org_id
    AND pdc.proposal_id = p_proposal_id
  ORDER BY pdc.embedding <-> query_embedding
  LIMIT match_count;
END;
$$;
```

**Confidence: HIGH** — pgvector similarity search SQL is stable and well-documented.

### 3.7 Retrieval Quality Gotchas

- **Similarity threshold:** Filter results with `similarity > 0.75` to discard
  irrelevant retrievals. Without a threshold, you'll inject noise into the prompt.
- **Hybrid search:** For regulatory documents, combine vector search with Postgres
  full-text search (`tsvector`) to catch exact term matches. ICH E6(R2) section 5.18.3
  may not appear in vector search results if the query uses different terminology.
- **Context window budget:** Claude Sonnet 4.5 has a 200K token context window —
  inject up to 20 regulatory chunks without concern. Keep prompt engineering
  disciplined: don't inject the whole chunk database.
- **Re-ranking:** For V2, consider a cross-encoder re-ranking step after initial
  retrieval to improve relevance ordering.

**Confidence: HIGH** for the threshold/budget advice; MEDIUM for hybrid search
implementation details (depends on pgvector + tsvector interaction specifics).

---

## 4. Multi-Tenancy Data Model

### 4.1 Core Data Model

```sql
-- Organizations (the CRO companies that subscribe to Jamo)
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,         -- for URLs / identification
  plan          TEXT DEFAULT 'trial',        -- 'trial', 'starter', 'pro', 'enterprise'
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles — extends Supabase auth.users
CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  role          TEXT NOT NULL DEFAULT 'user', -- 'super_admin', 'admin', 'user'
  full_name     TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Proposals
CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  created_by      UUID NOT NULL REFERENCES user_profiles(id),
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  client_name     TEXT,
  therapeutic_area TEXT,
  study_phase     TEXT,
  study_type      TEXT,
  due_date        DATE,
  estimated_value NUMERIC(15,2),
  currency        TEXT DEFAULT 'USD',
  indication      TEXT,
  description     TEXT,
  is_archived     BOOLEAN DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,               -- soft delete
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Proposal sections (AI-generated content, one row per section)
CREATE TABLE proposal_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  section_id    TEXT NOT NULL,              -- e.g., 'executive_summary'
  section_name  TEXT NOT NULL,
  content       TEXT,                       -- markdown text
  status        TEXT DEFAULT 'pending',     -- 'pending', 'generating', 'complete', 'error'
  is_locked     BOOLEAN DEFAULT FALSE,      -- user locked this section
  version       INTEGER DEFAULT 1,
  generated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Documents uploaded per proposal
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  proposal_id   UUID REFERENCES proposals(id),
  uploaded_by   UUID REFERENCES user_profiles(id),
  name          TEXT NOT NULL,
  storage_path  TEXT NOT NULL,             -- Supabase Storage path
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT,
  doc_type      TEXT,                      -- 'rfp', 'protocol', 'transcript', 'budget', 'template'
  parse_status  TEXT DEFAULT 'pending',   -- 'pending', 'parsed', 'error'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- AI chat history per proposal
CREATE TABLE chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  role          TEXT NOT NULL,             -- 'user' or 'assistant'
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Generation jobs (async queue)
CREATE TABLE generation_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  status          TEXT DEFAULT 'pending',  -- 'pending', 'running', 'complete', 'error'
  sections_total  INTEGER,
  sections_done   INTEGER DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Row Level Security Policies

**Enable RLS on all tables:**

```sql
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs      ENABLE ROW LEVEL SECURITY;
```

**Helper function — avoids repeated subqueries in policies:**

```sql
-- Returns the org_id for the currently authenticated user
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM user_profiles WHERE user_id = auth.uid();
$$;

-- Returns the role for the currently authenticated user
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM user_profiles WHERE user_id = auth.uid();
$$;
```

**Proposals RLS:**

```sql
-- All org members can read their own org's proposals
CREATE POLICY "proposals_select" ON proposals
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id() AND deleted_at IS NULL);

-- Any org member can create proposals
CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id());

-- Any org member can update (scope to 'user' role is handled at app layer for MVP)
CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id());

-- Soft delete: only admins can set deleted_at
CREATE POLICY "proposals_delete" ON proposals
  FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'super_admin'));
```

**Proposal sections, documents, chat messages — same pattern:**

```sql
CREATE POLICY "proposal_sections_all" ON proposal_sections
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "documents_all" ON documents
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "chat_messages_all" ON chat_messages
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());
```

**User profiles — users see only their own org:**

```sql
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

-- Users can only update their own profile
CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
```

**Super admin bypass (platform owner sees everything):**

```sql
-- Add to each table's SELECT policy
CREATE POLICY "super_admin_all" ON proposals
  FOR ALL TO authenticated
  USING (get_user_role() = 'super_admin');
```

**Confidence: HIGH** — Supabase RLS with org_id scoping is the canonical pattern
for B2B multi-tenant SaaS on Supabase.

### 4.3 Auth + Org Membership Pattern

**Supabase Auth handles authentication.** Org membership is tracked in `user_profiles`.

**Sign-up flow:**

1. User signs up via `supabase.auth.signUp()` — creates record in `auth.users`.
2. A Postgres trigger (or Edge Function) creates a `user_profiles` row:

```sql
-- Auto-create user_profile on auth.user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- org_id is passed as user_metadata during signup
  INSERT INTO user_profiles (user_id, org_id, role, full_name)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'org_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

**Org creation flow (admin signs up first):**

1. Admin creates org via a dedicated Edge Function (`POST /functions/v1/create-org`)
   that uses the service role key to insert into `organizations` and create the
   `user_profiles` row with `role = 'admin'`.
2. Admin invites team members via email — Supabase Auth `inviteUserByEmail()` with
   `org_id` in the metadata.

**Session and org context in client:**

```typescript
// After auth.getSession(), fetch the user's profile including org_id
const { data: profile } = await supabase
  .from("user_profiles")
  .select("*, organizations(*)")
  .eq("user_id", session.user.id)
  .single();

// Store in React context for use throughout the app
// All API calls automatically scope to the user's org via RLS
```

**Confidence: HIGH** — this trigger + metadata pattern is documented in Supabase
guides.

### 4.4 Critical RLS Gotchas

**Gotcha 1: RLS does not apply to service_role key**
Any Edge Function that uses `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS. Be
explicit: use the service role only when you've already validated the user's access.
For reads that should respect RLS, use the user's JWT in the client constructor:

```typescript
// Service role: bypasses RLS
const supabaseAdmin = createClient(url, serviceRoleKey);

// User-scoped: respects RLS
const supabaseUser = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${userJwt}` } }
});
```

**Gotcha 2: `get_user_org_id()` function performance**
The helper function runs a subquery on every RLS policy evaluation. On high-traffic
tables this can be a bottleneck. Mitigation: ensure `user_profiles.user_id` has an
index (it does via the UNIQUE constraint).

**Gotcha 3: org_id on every table is critical**
Without `org_id` on every row, you cannot write a single-clause RLS policy. Do not
rely on JOINs in RLS policies (they work but are slow). Denormalize `org_id` onto
every table, even if it's redundant.

**Gotcha 4: Realtime and RLS**
Supabase Realtime respects RLS for `postgres_changes` subscriptions when the
`Authorization` header is sent. Always send the user's JWT when subscribing to
ensure they only receive their org's events.

**Gotcha 5: soft deletes need policy attention**
If using soft deletes (`deleted_at IS NOT NULL`), make sure SELECT policies filter
them out. The policy shown above (`deleted_at IS NULL`) handles this for proposals.

**Confidence: HIGH** — all gotchas are documented or widely discussed in Supabase
community.

---

## 5. Key Constraints Summary and Implementation Recommendations

### 5.1 Edge Function Architecture Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Section generation approach | Async job + Realtime | Full proposal exceeds 150s timeout |
| Streaming individual sections | Direct SSE streaming via raw fetch | Works within timeout per section |
| File upload path | Client → Storage → Edge Function | Avoids 6MB body limit |
| API key storage | Supabase project env vars | Never in frontend or git |
| Supabase client in Edge Function | Service role for writes; user JWT for user-scoped reads | Correct RLS behavior |

### 5.2 Document Parsing Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| PDF extraction library | pdfjs-dist via esm.sh | More robust than pdf-parse in Deno |
| DOCX extraction library | mammoth via npm: specifier | No native deps, reliable |
| XLSX extraction | SheetJS (xlsx) via npm: specifier | Industry standard |
| Chunk target size | 400–600 tokens | Balances precision vs. context |
| Chunk overlap | 100 tokens | Preserves cross-chunk context |

### 5.3 RAG Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Embedding model | OpenAI text-embedding-3-small | Best cost/quality, 1536 dims |
| Vector index | HNSW (if pgvector ≥ 0.5) else IVFFlat | HNSW is faster, no training |
| Retrieval count | 5–10 chunks per query | Balances context vs. noise |
| Similarity threshold | 0.75 cosine similarity | Filter irrelevant retrievals |
| Regulatory doc split strategy | Section-boundary-aware | Preserves structured doc integrity |

### 5.4 Multi-Tenancy Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Isolation mechanism | Row Level Security + org_id on every table | Supabase native, no app-layer leaks |
| org_id lookup in policies | `get_user_org_id()` helper function | DRY, indexable, performant |
| Auth trigger | Postgres trigger on auth.users | Automatic, no race conditions |
| Super admin access | Additional RLS policy for role = 'super_admin' | Clean, no bypassing auth layer |
| Service role usage | Edge Functions only, after user validation | Principle of least privilege |

---

## 6. Open Questions and Items to Verify

These items require verification against current documentation before implementation:

1. **Edge Function timeout limits:** Confirm the 150-second wall-clock limit is still
   current. Supabase has been increasing limits. URL: https://supabase.com/docs/guides/functions/limits

2. **pgvector version on Supabase projects:** Confirm whether HNSW indexes are
   available (requires pgvector ≥ 0.5). Check via `SELECT * FROM pg_extension WHERE extname = 'vector'`.

3. **pdfjs-dist Deno compatibility:** The specific esm.sh or npm: specifier for
   pdfjs-dist needs empirical testing in a Supabase Edge Function environment.
   Prototype this in a throwaway function before building the production pipeline.

4. **OpenAI embedding model availability:** `text-embedding-3-small` was released
   in January 2024 and should be stable. Verify it's accessible and that the
   1536-dimension output is correct (it supports truncation to lower dims).

5. **Supabase Realtime RLS behavior:** Test that `postgres_changes` subscriptions
   correctly filter by RLS when Authorization header is included. This is documented
   but has historically had edge cases.

6. **mammoth Deno compatibility via npm: specifier:** Test in isolation.
   mammoth depends on JSZip internally — confirm the npm: compat layer handles this.

---

*Research complete. No web tools were available; all findings are from training data
(cutoff ~August 2025). Treat MEDIUM confidence findings as requiring verification
before implementation.*
