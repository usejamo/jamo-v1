-- Migration: 20260710000001_chunks_proposal_scope_columns.sql
-- Phase 14.7 (Plan 01): Additive schema for proposal-history scoping (R1, R4, R5)
-- NOTE: authored here, applied to the live project in Plan 06 (deploy-first gate).

-- chunks: proposal_id is the single source of truth for proposal scope (R1).
-- Nullable: regulatory chunks have no proposal. ON DELETE CASCADE: chunks die with their proposal.
ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS proposal_id uuid NULL
  REFERENCES public.proposals(id) ON DELETE CASCADE;

-- Index the new FK for the RPC join + eligibility filter (Plan 02 joins proposals ON chunks.proposal_id).
CREATE INDEX IF NOT EXISTS chunks_proposal_id_idx ON public.chunks(proposal_id);

-- proposals: per-proposal tri-state override (R4). NULL = follow category/master switch;
-- true = force eligible; false = force excluded. Default NULL.
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS reference_override boolean NULL;

-- organizations: three master switches (R5). Constant defaults ONLY (D-01a: metadata-only on PG17.6,
-- existing 2 orgs auto-land on the safe state with no backfill UPDATE). Do NOT use a volatile default.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS learn_from_won       boolean NOT NULL DEFAULT true;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS learn_from_submitted boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS learn_from_lost      boolean NOT NULL DEFAULT false;
