-- Migration 015: Replace regulatory_chunks with unified chunks table
-- Drops old Phase 1 table (no production data — safe per design)
-- Creates multi-tenant chunks table supporting both ingestion paths and hybrid search

DROP TABLE IF EXISTS regulatory_chunks;

CREATE TABLE chunks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type          TEXT NOT NULL CHECK (doc_type IN ('regulatory', 'proposal')),
  source            TEXT NOT NULL,
  content           TEXT NOT NULL,
  embedding         extensions.vector(1536),
  agency            TEXT,
  guideline_type    TEXT,
  therapeutic_area  TEXT,
  search_vector     TSVECTOR,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tsvector update trigger — created BEFORE any data insert (locked decision)
CREATE TRIGGER chunks_search_vector_update
  BEFORE INSERT OR UPDATE ON chunks
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english', content, source);

-- HNSW index — cosine similarity, parameters match Phase 1 migration
CREATE INDEX idx_chunks_embedding
  ON chunks USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for full-text search
CREATE INDEX idx_chunks_search_vector ON chunks USING gin(search_vector);

-- Composite index for org-scoped doc_type queries (used by retrieve-context)
CREATE INDEX idx_chunks_org_doctype ON chunks(org_id, doc_type);

-- RLS — matches org_id pattern used on all existing tables
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY chunks_org_isolation ON chunks
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));
