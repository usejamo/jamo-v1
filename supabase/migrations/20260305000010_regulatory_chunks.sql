-- Shared platform knowledge base — no org_id (not tenant-scoped)
-- No RLS: all authenticated users can read regulatory documents
-- Populated in Phase 4 (regulatory document ingestion)
-- embedding: OpenAI text-embedding-3-small = 1536 dimensions
-- Uses extensions.vector because pgvector was installed in extensions schema (migration 001)
CREATE TABLE regulatory_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name TEXT NOT NULL,
  -- e.g. 'ICH E6(R2) GCP Guidelines', 'FDA Guidance: Clinical Trial Endpoints'
  document_type TEXT NOT NULL,
  -- values: 'ICH', 'FDA', 'EMA'
  section_ref   TEXT,
  -- e.g. 'Section 5.18.3', 'Chapter 4'
  content       TEXT NOT NULL,
  embedding     extensions.vector(1536),
  -- NULL until populated in Phase 4 (vector column exists, data comes later)
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index: cosine similarity, standard production parameters
-- Builds immediately without training (unlike IVFFlat which requires data first)
-- m=16: max connections per layer; ef_construction=64: build quality vs speed tradeoff
CREATE INDEX idx_regulatory_chunks_embedding
  ON regulatory_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
