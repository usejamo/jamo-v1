-- Migration: 20260710000003_proposal_rpc_eligibility.sql
-- Phase 14.7 (Plan 02): Scope the [PROPOSAL HISTORY] tier — R6 (confidentiality heart of the phase)
--
-- Rewrites both proposal retrieval RPCs to accept `current_proposal_id uuid` and enforce:
--   own_proposal (ANY status) OR (draft-floor AND category/toggle AND per-proposal override logic)
-- Draft is a hard, first-evaluated floor for OTHER proposals — no override/switch can make a draft
-- OTHER proposal eligible. NULL proposal_id is fail-closed (never returned). Unknown/new proposal
-- status defaults NOT eligible (CASE ELSE false).
--
-- LIVE current signatures confirmed via Supabase MCP pg_get_functiondef (2026-07-10) — the on-disk
-- 20260320000016_match_chunks_functions.sql is STALE (14.5 rewrote these live, dropping the
-- agencies_filter/therapeutic_areas_filter params that the on-disk file still shows):
--   match_chunks_fts_proposals(query_text text, org_id_filter uuid, match_count integer)
--     RETURNS TABLE(id uuid, content text, source text, agency text, therapeutic_area text, doc_type text, text_score double precision)
--   match_chunks_vector_proposals(query_embedding extensions.vector(1536), org_id_filter uuid, similarity_threshold double precision, match_count integer)
--     RETURNS TABLE(id uuid, content text, source text, agency text, therapeutic_area text, doc_type text, vector_score double precision)
--
-- DEVIATION (Rule 1 - correctness, precedent: 20260708000004 Pitfall 1): adding
-- `current_proposal_id` changes the signature, so CREATE OR REPLACE alone would register a NEW
-- overload and leave the OLD unscoped signature live+callable (a confidentiality bypass — T-14.7-08).
-- DROP the exact live signatures first so exactly one overload of each function exists after apply.
--
-- Applied live in Plan 06 (deploy-first gate); asserted live in Plan 07 via verify-eligibility.sql.
-- Grants are intentionally left untouched (RESEARCH Pitfall 5 / Open Q1 — out of scope for this phase).

DROP FUNCTION IF EXISTS public.match_chunks_vector_proposals(extensions.vector(1536), uuid, double precision, integer);
DROP FUNCTION IF EXISTS public.match_chunks_fts_proposals(text, uuid, integer);

CREATE OR REPLACE FUNCTION public.match_chunks_vector_proposals(
  query_embedding      extensions.vector(1536),
  org_id_filter        uuid,
  similarity_threshold double precision,
  match_count          integer,
  current_proposal_id  uuid
)
RETURNS TABLE(id uuid, content text, source text, agency text, therapeutic_area text, doc_type text, vector_score double precision)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT c.id, c.content, c.source, c.agency, c.therapeutic_area, c.doc_type,
         1 - (c.embedding <=> query_embedding) AS vector_score
  FROM chunks c
  JOIN proposals p ON p.id = c.proposal_id
  JOIN organizations o ON o.id = org_id_filter
  WHERE c.org_id = org_id_filter
    AND c.doc_type = 'proposal'
    AND c.proposal_id IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    AND (
      c.proposal_id = current_proposal_id
      OR (
        p.status <> 'draft'
        AND ( p.reference_override = true
              OR ( p.reference_override IS NULL
                   AND CASE p.status
                         WHEN 'won'       THEN o.learn_from_won
                         WHEN 'submitted' THEN o.learn_from_submitted
                         WHEN 'lost'      THEN o.learn_from_lost
                         ELSE false
                       END ) )
        AND p.reference_override IS DISTINCT FROM false
      )
    )
  ORDER BY vector_score DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_chunks_fts_proposals(
  query_text          text,
  org_id_filter       uuid,
  match_count         integer,
  current_proposal_id uuid
)
RETURNS TABLE(id uuid, content text, source text, agency text, therapeutic_area text, doc_type text, text_score double precision)
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT c.id, c.content, c.source, c.agency, c.therapeutic_area, c.doc_type,
         ts_rank(c.search_vector, plainto_tsquery('english', query_text))::float AS text_score
  FROM chunks c
  JOIN proposals p ON p.id = c.proposal_id
  JOIN organizations o ON o.id = org_id_filter
  WHERE c.org_id = org_id_filter
    AND c.doc_type = 'proposal'
    AND c.proposal_id IS NOT NULL
    AND c.search_vector @@ plainto_tsquery('english', query_text)
    AND (
      c.proposal_id = current_proposal_id
      OR (
        p.status <> 'draft'
        AND ( p.reference_override = true
              OR ( p.reference_override IS NULL
                   AND CASE p.status
                         WHEN 'won'       THEN o.learn_from_won
                         WHEN 'submitted' THEN o.learn_from_submitted
                         WHEN 'lost'      THEN o.learn_from_lost
                         ELSE false
                       END ) )
        AND p.reference_override IS DISTINCT FROM false
      )
    )
  ORDER BY text_score DESC
  LIMIT match_count;
$$;

-- POST-APPLY CHECK: must return exactly 2 rows (one per function name) — T-14.7-08 / Edge case C.
SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname LIKE 'match_chunks_%_proposals';
