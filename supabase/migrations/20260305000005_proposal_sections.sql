CREATE TABLE proposal_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,
  -- e.g. 'executive_summary', 'study_understanding', 'cover_letter'
  section_name  TEXT NOT NULL,
  content       TEXT,  -- markdown or TipTap JSON, populated during Phase 7
  status        TEXT NOT NULL DEFAULT 'pending',
  -- status values: 'pending', 'generating', 'complete', 'error', 'needs_review'
  is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  version       INTEGER NOT NULL DEFAULT 1,
  generated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id, section_key)
);
CREATE INDEX idx_proposal_sections_proposal_id ON proposal_sections(proposal_id);
