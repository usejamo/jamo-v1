-- Migration: Phase 14.5 — atomic ingest_regulatory_document SECURITY DEFINER RPC
-- The entire ingest sequence (parent upsert-in-place → supersession flip → parent-scoped chunk
-- replace) runs as one implicit plpgsql transaction. Any failure rolls back, so a superseded
-- predecessor can never be orphaned and no duplicate active document_key can result. Pre-embedded
-- chunks arrive as a jsonb array (Postgres cannot call OpenAI). Called by the tsx CLI as service-role.
-- Applied in Plan 03 (Wave 2).

CREATE OR REPLACE FUNCTION public.ingest_regulatory_document(
  p_document_key            TEXT,
  p_title                   TEXT,
  p_agency                  TEXT,
  p_therapeutic_area        TEXT,
  p_phase                   TEXT[],
  p_geography               TEXT[],
  p_effective_date          DATE,
  p_status                  TEXT,
  p_source                  TEXT,
  p_supersedes_document_key TEXT,
  p_chunks                  JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
  v_supersedes_id UUID;
BEGIN
  SELECT id INTO v_id FROM regulatory_documents WHERE document_key = p_document_key;
  IF v_id IS NULL THEN
    INSERT INTO regulatory_documents (document_key, title, agency, therapeutic_area, phase, geography, effective_date, status, source)
    VALUES (p_document_key, p_title, p_agency, p_therapeutic_area, p_phase, p_geography, p_effective_date, COALESCE(p_status,'active'), p_source)
    RETURNING id INTO v_id;
  ELSE
    UPDATE regulatory_documents
      SET title = p_title, agency = p_agency, therapeutic_area = p_therapeutic_area,
          phase = p_phase, geography = p_geography, effective_date = p_effective_date,
          status = COALESCE(p_status,'active'), source = p_source, updated_at = NOW()
      WHERE id = v_id;   -- document_key intentionally NEVER in this SET clause
  END IF;

  IF p_supersedes_document_key IS NOT NULL THEN
    SELECT id INTO v_supersedes_id FROM regulatory_documents
      WHERE document_key = p_supersedes_document_key AND status = 'active' AND id <> v_id;
    IF v_supersedes_id IS NOT NULL THEN
      UPDATE regulatory_documents SET status = 'superseded', superseded_by = v_id, updated_at = NOW()
        WHERE id = v_supersedes_id;
      UPDATE regulatory_documents SET supersedes = v_supersedes_id, updated_at = NOW()
        WHERE id = v_id;
    END IF;
  END IF;

  DELETE FROM chunks WHERE regulatory_document_id = v_id;   -- scoped to this parent only (Pitfall 4)

  INSERT INTO chunks (org_id, doc_type, source, content, embedding, guideline_type, regulatory_document_id, metadata)
  SELECT NULL, 'regulatory', COALESCE(elem->>'source', p_source), elem->>'content',
         (elem->>'embedding')::extensions.vector, elem->>'guideline_type', v_id,
         jsonb_build_object('tokenCount', (elem->>'token_count')::int)
  FROM jsonb_array_elements(p_chunks) AS elem;

  RETURN v_id;
END;
$$;

-- Supabase's default privileges GRANT EXECUTE to anon/authenticated/service_role directly on
-- function creation, so revoking from PUBLIC alone is insufficient — revoke the direct grants too.
REVOKE ALL ON FUNCTION public.ingest_regulatory_document(TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT[],DATE,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_regulatory_document(TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT[],DATE,TEXT,TEXT,TEXT,JSONB) TO service_role;
