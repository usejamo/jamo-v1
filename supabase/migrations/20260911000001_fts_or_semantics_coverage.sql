-- FTS arm: OR semantics + coverage weighting + cover-density ranking
--
-- PROBLEM
-- Both FTS RPCs matched with plainto_tsquery('english', query_text), which ANDs
-- every lexeme. A conversational question therefore required every non-stopword
-- to co-occur in ONE chunk, so the arm returned nothing for the phrasing users
-- actually type. Measured in production against a proposal whose own RFP chunk
-- contains the answer:
--
--   "What is the RFP reference number for this study, and which EDC system
--    does the sponsor say they prefer?"   -> 0 rows
--   "EDC Medidata Veeva"                  -> 3 rows
--   "VBP-2025-ADVANCE-301"                -> 2 rows
--
-- With the vector arm independently filtered out by its cosine floor, both arms
-- failed at once and retrieve-context returned an empty context — so the model
-- reported that facts sitting in the corpus "have not been provided".
--
-- WHY NOT websearch_to_tsquery: it also ANDs terms by default; it only ORs on a
-- literal "or" in the input. It would not fix this.
--
-- APPROACH
--   or_q   — plainto_tsquery's lexemes (already stemmed and stopword-stripped)
--            re-joined with '|' so ANY term can match.
--   coverage — fraction of query lexemes present in the chunk. This is the
--            precision signal that replaces AND: a chunk matching all lexemes
--            scores coverage = 1.0, which is exactly the old AND condition, so
--            exact identifiers (VBP-2025-ADVANCE-301) still sort to the top
--            without a separate phrase pass.
--   ts_rank_cd — cover density ranking rather than ts_rank: it rewards matched
--            lexemes appearing CLOSE TOGETHER, which is what makes a passage
--            actually about the query rather than merely containing the words.
--
-- Score = 0.7 * coverage + 0.3 * min(ts_rank_cd * 10, 1.0)
-- Coverage-dominant, both terms normalised to 0..1. Absolute scale is not
-- load-bearing downstream — the merge fuses by RANK (RRF), not by raw score —
-- but ordering within this arm is.
--
-- Signatures, return types, SECURITY DEFINER and search_path are unchanged, as
-- is every eligibility/filter predicate. Only matching and scoring change.

-- ---------------------------------------------------------------------------
-- Regulatory corpus
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_chunks_fts(
  query_text              text,
  org_id_filter           uuid,
  agencies_filter         text[],
  therapeutic_areas_filter text[],
  phases_filter           text[],
  geographies_filter      text[],
  match_count             integer
)
RETURNS TABLE(id uuid, content text, source text, agency text, therapeutic_area text, doc_type text, text_score double precision)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH q AS (
    SELECT
      plainto_tsquery('english', query_text) AS and_q,
      NULLIF(btrim(replace(plainto_tsquery('english', query_text)::text, ' & ', ' | ')), '')::tsquery AS or_q,
      GREATEST(
        COALESCE(array_length(string_to_array(plainto_tsquery('english', query_text)::text, ' & '), 1), 0),
        1
      ) AS n_lex
  )
  SELECT c.id, c.content, c.source, rd.agency, rd.therapeutic_area, c.doc_type,
         (
           0.7 * (cov.matched::float / q.n_lex::float)
           + 0.3 * LEAST(ts_rank_cd(c.search_vector, q.or_q) * 10.0, 1.0)
         )::FLOAT AS text_score
  FROM chunks c
  JOIN regulatory_documents rd ON rd.id = c.regulatory_document_id
  CROSS JOIN q
  LEFT JOIN LATERAL (
    SELECT count(*) AS matched
    FROM unnest(string_to_array(q.and_q::text, ' & ')) AS lex
    WHERE c.search_vector @@ lex::tsquery
  ) cov ON true
  WHERE (c.org_id = org_id_filter OR c.org_id IS NULL)
    AND c.doc_type = 'regulatory'
    AND rd.status = 'active'
    AND (agencies_filter IS NULL OR rd.agency = ANY(agencies_filter))
    AND (therapeutic_areas_filter IS NULL OR rd.therapeutic_area = ANY(therapeutic_areas_filter))
    AND (phases_filter IS NULL OR rd.phase IS NULL OR rd.phase && phases_filter)
    AND (geographies_filter IS NULL OR rd.geography && geographies_filter OR rd.geography && '{GLOBAL}')
    AND q.or_q IS NOT NULL
    AND c.search_vector @@ q.or_q
  ORDER BY text_score DESC
  LIMIT match_count;
$function$;

-- ---------------------------------------------------------------------------
-- Proposal corpus — eligibility clause preserved verbatim from
-- 20260710000003_proposal_rpc_eligibility.sql (own proposal any status, others
-- only when non-draft and opted into).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_chunks_fts_proposals(
  query_text          text,
  org_id_filter       uuid,
  match_count         integer,
  current_proposal_id uuid
)
RETURNS TABLE(id uuid, content text, source text, agency text, therapeutic_area text, doc_type text, text_score double precision)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH q AS (
    SELECT
      plainto_tsquery('english', query_text) AS and_q,
      NULLIF(btrim(replace(plainto_tsquery('english', query_text)::text, ' & ', ' | ')), '')::tsquery AS or_q,
      GREATEST(
        COALESCE(array_length(string_to_array(plainto_tsquery('english', query_text)::text, ' & '), 1), 0),
        1
      ) AS n_lex
  )
  SELECT c.id, c.content, c.source, c.agency, c.therapeutic_area, c.doc_type,
         (
           0.7 * (cov.matched::float / q.n_lex::float)
           + 0.3 * LEAST(ts_rank_cd(c.search_vector, q.or_q) * 10.0, 1.0)
         )::FLOAT AS text_score
  FROM chunks c
  JOIN proposals p ON p.id = c.proposal_id
  JOIN organizations o ON o.id = org_id_filter
  CROSS JOIN q
  LEFT JOIN LATERAL (
    SELECT count(*) AS matched
    FROM unnest(string_to_array(q.and_q::text, ' & ')) AS lex
    WHERE c.search_vector @@ lex::tsquery
  ) cov ON true
  WHERE c.org_id = org_id_filter
    AND c.doc_type = 'proposal'
    AND c.proposal_id IS NOT NULL
    AND q.or_q IS NOT NULL
    AND c.search_vector @@ q.or_q
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
$function$;
