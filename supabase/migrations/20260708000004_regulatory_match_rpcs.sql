-- Migration: Phase 14.5 — rewrite regulatory match RPCs
-- match_chunks_vector / match_chunks_fts now JOIN the versioned regulatory_documents parent,
-- enforce status='active', read agency/therapeutic_area from the parent, accept new phase/geography
-- pre-filters, and relax the tenant clause to (org_id = filter OR org_id IS NULL). The
-- `c.doc_type = 'regulatory'` predicate is preserved so the OR-NULL branch can never reach proposal
-- chunks. The proposal-side match RPC variants are intentionally NOT touched (BRIEF explicit).
-- Applied in Plan 03 (Wave 2); the deployed retrieve-context (Plan 05) MUST match these signatures.

-- DEVIATION (Rule 1 - correctness): the new signatures add phases_filter/geographies_filter params,
-- so CREATE OR REPLACE would register NEW overloads and leave the OLD pre-join signatures callable
-- (returning stale results from chunks.agency/therapeutic_area, now always NULL for regulatory).
-- Drop the old signatures explicitly so only the joined versions exist. Proposal RPC overloads are
-- a different function name and are untouched.
DROP FUNCTION IF EXISTS match_chunks_vector(extensions.vector(1536), UUID, TEXT[], TEXT[], FLOAT, INT);
DROP FUNCTION IF EXISTS match_chunks_fts(TEXT, UUID, TEXT[], TEXT[], INT);

CREATE OR REPLACE FUNCTION match_chunks_vector(
  query_embedding          extensions.vector(1536),
  org_id_filter            UUID,
  agencies_filter          TEXT[],
  therapeutic_areas_filter TEXT[],
  phases_filter            TEXT[],
  geographies_filter       TEXT[],
  similarity_threshold     FLOAT,
  match_count              INT
)
RETURNS TABLE (id UUID, content TEXT, source TEXT, agency TEXT, therapeutic_area TEXT, doc_type TEXT, vector_score FLOAT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT c.id, c.content, c.source, rd.agency, rd.therapeutic_area, c.doc_type,
    1 - (c.embedding <=> query_embedding) AS vector_score
  FROM chunks c
  JOIN regulatory_documents rd ON rd.id = c.regulatory_document_id
  WHERE (c.org_id = org_id_filter OR c.org_id IS NULL)
    AND c.doc_type = 'regulatory'
    AND rd.status = 'active'
    AND (agencies_filter IS NULL OR rd.agency = ANY(agencies_filter))
    AND (therapeutic_areas_filter IS NULL OR rd.therapeutic_area = ANY(therapeutic_areas_filter))
    AND (phases_filter IS NULL OR rd.phase IS NULL OR rd.phase && phases_filter)
    AND (geographies_filter IS NULL OR rd.geography && geographies_filter OR rd.geography && '{GLOBAL}')
    AND 1 - (c.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY vector_score DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION match_chunks_fts(
  query_text               TEXT,
  org_id_filter            UUID,
  agencies_filter          TEXT[],
  therapeutic_areas_filter TEXT[],
  phases_filter            TEXT[],
  geographies_filter       TEXT[],
  match_count              INT
)
RETURNS TABLE (id UUID, content TEXT, source TEXT, agency TEXT, therapeutic_area TEXT, doc_type TEXT, text_score FLOAT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT c.id, c.content, c.source, rd.agency, rd.therapeutic_area, c.doc_type,
    ts_rank(c.search_vector, plainto_tsquery('english', query_text))::FLOAT AS text_score
  FROM chunks c
  JOIN regulatory_documents rd ON rd.id = c.regulatory_document_id
  WHERE (c.org_id = org_id_filter OR c.org_id IS NULL)
    AND c.doc_type = 'regulatory'
    AND rd.status = 'active'
    AND (agencies_filter IS NULL OR rd.agency = ANY(agencies_filter))
    AND (therapeutic_areas_filter IS NULL OR rd.therapeutic_area = ANY(therapeutic_areas_filter))
    AND (phases_filter IS NULL OR rd.phase IS NULL OR rd.phase && phases_filter)
    AND (geographies_filter IS NULL OR rd.geography && geographies_filter OR rd.geography && '{GLOBAL}')
    AND c.search_vector @@ plainto_tsquery('english', query_text)
  ORDER BY text_score DESC
  LIMIT match_count;
$$;
