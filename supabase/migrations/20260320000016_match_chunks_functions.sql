-- Migration 016: PostgreSQL functions for retrieve-context Edge Function RPC calls
-- These functions are called via supabase.rpc() from supabase/functions/retrieve-context/index.ts
-- Uses hybrid search pattern: vector similarity (HNSW cosine) + full-text search (tsvector)

-- 1. Vector similarity search for regulatory chunks (doc_type = 'regulatory')
CREATE OR REPLACE FUNCTION match_chunks_vector(
  query_embedding    extensions.vector(1536),
  org_id_filter      UUID,
  agencies_filter    TEXT[],
  therapeutic_areas_filter TEXT[],
  similarity_threshold FLOAT,
  match_count        INT
)
RETURNS TABLE (
  id                 UUID,
  content            TEXT,
  source             TEXT,
  agency             TEXT,
  therapeutic_area   TEXT,
  doc_type           TEXT,
  vector_score       FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    id,
    content,
    source,
    agency,
    therapeutic_area,
    doc_type,
    1 - (embedding <=> query_embedding) AS vector_score
  FROM chunks
  WHERE org_id = org_id_filter
    AND doc_type = 'regulatory'
    AND (agencies_filter IS NULL OR agency = ANY(agencies_filter))
    AND (therapeutic_areas_filter IS NULL OR therapeutic_area = ANY(therapeutic_areas_filter))
    AND 1 - (embedding <=> query_embedding) >= similarity_threshold
  ORDER BY vector_score DESC
  LIMIT match_count;
$$;

-- 2. Full-text search for regulatory chunks (doc_type = 'regulatory')
CREATE OR REPLACE FUNCTION match_chunks_fts(
  query_text         TEXT,
  org_id_filter      UUID,
  agencies_filter    TEXT[],
  therapeutic_areas_filter TEXT[],
  match_count        INT
)
RETURNS TABLE (
  id                 UUID,
  content            TEXT,
  source             TEXT,
  agency             TEXT,
  therapeutic_area   TEXT,
  doc_type           TEXT,
  text_score         FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    id,
    content,
    source,
    agency,
    therapeutic_area,
    doc_type,
    ts_rank(search_vector, plainto_tsquery('english', query_text))::FLOAT AS text_score
  FROM chunks
  WHERE org_id = org_id_filter
    AND doc_type = 'regulatory'
    AND (agencies_filter IS NULL OR agency = ANY(agencies_filter))
    AND (therapeutic_areas_filter IS NULL OR therapeutic_area = ANY(therapeutic_areas_filter))
    AND search_vector @@ plainto_tsquery('english', query_text)
  ORDER BY text_score DESC
  LIMIT match_count;
$$;

-- 3. Vector similarity search for proposal chunks (doc_type = 'proposal')
-- No agency/therapeutic_area filter -- org_id isolates proposal data
CREATE OR REPLACE FUNCTION match_chunks_vector_proposals(
  query_embedding    extensions.vector(1536),
  org_id_filter      UUID,
  similarity_threshold FLOAT,
  match_count        INT
)
RETURNS TABLE (
  id                 UUID,
  content            TEXT,
  source             TEXT,
  agency             TEXT,
  therapeutic_area   TEXT,
  doc_type           TEXT,
  vector_score       FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    id,
    content,
    source,
    agency,
    therapeutic_area,
    doc_type,
    1 - (embedding <=> query_embedding) AS vector_score
  FROM chunks
  WHERE org_id = org_id_filter
    AND doc_type = 'proposal'
    AND 1 - (embedding <=> query_embedding) >= similarity_threshold
  ORDER BY vector_score DESC
  LIMIT match_count;
$$;

-- 4. Full-text search for proposal chunks (doc_type = 'proposal')
CREATE OR REPLACE FUNCTION match_chunks_fts_proposals(
  query_text         TEXT,
  org_id_filter      UUID,
  match_count        INT
)
RETURNS TABLE (
  id                 UUID,
  content            TEXT,
  source             TEXT,
  agency             TEXT,
  therapeutic_area   TEXT,
  doc_type           TEXT,
  text_score         FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    id,
    content,
    source,
    agency,
    therapeutic_area,
    doc_type,
    ts_rank(search_vector, plainto_tsquery('english', query_text))::FLOAT AS text_score
  FROM chunks
  WHERE org_id = org_id_filter
    AND doc_type = 'proposal'
    AND search_vector @@ plainto_tsquery('english', query_text)
  ORDER BY text_score DESC
  LIMIT match_count;
$$;
