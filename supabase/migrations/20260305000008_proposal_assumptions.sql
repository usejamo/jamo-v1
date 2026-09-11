CREATE TABLE proposal_assumptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,
  -- category values: 'sponsor_metadata', 'scope', 'timeline', 'budget', 'criteria'
  -- Source of truth is ASSUMPTION_CATEGORIES in src/types/wizard.ts. Left as a
  -- bare TEXT column deliberately: extract-assumptions is an LLM and the client
  -- batch-inserts its output, so a CHECK here would turn one hallucinated
  -- category into a failed insert that loses the whole extraction. The client
  -- coerces unknown values instead.
  -- (This comment previously listed 'missing', which has never existed in the
  -- table, and omitted 'criteria', which is 12.6% of rows.)
  content         TEXT NOT NULL,
  confidence      TEXT NOT NULL DEFAULT 'medium',
  -- confidence values: 'high', 'medium', 'low'
  status          TEXT NOT NULL DEFAULT 'pending',
  -- status values: 'pending', 'approved', 'rejected', 'edited'
  user_edited     BOOLEAN NOT NULL DEFAULT FALSE,
  source_document UUID REFERENCES proposal_documents(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposal_assumptions_proposal_id ON proposal_assumptions(proposal_id);
