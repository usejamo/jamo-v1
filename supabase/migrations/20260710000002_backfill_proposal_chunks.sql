-- Migration: 20260710000002_backfill_proposal_chunks.sql
-- Phase 14.7 (Plan 01): One-time fail-closed backfill of chunks.proposal_id (R3)
-- Join path used ONCE here only: chunks.metadata->>'document_id' -> proposal_documents.id -> proposal_documents.proposal_id.
-- After this, chunks.proposal_id is the permanent scoping key; the metadata join is retired (BRIEF § SCHEMA).
-- NOTE: authored here, applied to the live project in Plan 06 (deploy-first gate).

-- Disposable audit artifact (D-05b: drop after inspection; leading underscore = disposable).
CREATE TABLE IF NOT EXISTS public._backfill_unresolved_proposal_chunks (
  chunk_id    uuid NOT NULL,
  document_id text NULL,
  reason      text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Resolve + populate.
UPDATE public.chunks c
SET proposal_id = pd.proposal_id
FROM public.proposal_documents pd
WHERE c.doc_type = 'proposal'
  AND c.proposal_id IS NULL
  AND (c.metadata->>'document_id') IS NOT NULL
  AND pd.id = (c.metadata->>'document_id')::uuid
  AND pd.proposal_id IS NOT NULL;

-- Record every still-unresolved proposal chunk (fail-closed: LEFT NULL, never guessed). D-05/D-05a.
INSERT INTO public._backfill_unresolved_proposal_chunks (chunk_id, document_id, reason)
SELECT c.id,
       c.metadata->>'document_id',
       CASE
         WHEN (c.metadata->>'document_id') IS NULL THEN 'missing document_id'
         WHEN NOT EXISTS (SELECT 1 FROM public.proposal_documents pd WHERE pd.id = (c.metadata->>'document_id')::uuid)
           THEN 'orphaned document_id (no proposal_documents row)'
         ELSE 'proposal_document has null proposal_id'
       END
FROM public.chunks c
WHERE c.doc_type = 'proposal'
  AND c.proposal_id IS NULL;

-- Headline signal: count of unresolvable proposal chunks (R3 / BRIEF verification case 7).
DO $$
DECLARE v_unresolved bigint;
BEGIN
  SELECT count(*) INTO v_unresolved FROM public._backfill_unresolved_proposal_chunks;
  RAISE NOTICE '[14.7 backfill] unresolvable proposal chunks: %', v_unresolved;
END $$;

-- Final SELECT so the apply-migration tool surfaces the count in its result payload too.
SELECT count(*) AS unresolved_proposal_chunks FROM public._backfill_unresolved_proposal_chunks;
