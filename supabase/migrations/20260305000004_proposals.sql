CREATE TABLE proposals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES user_profiles(id),
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  -- status values: 'draft', 'in_progress', 'in_review', 'submitted', 'won', 'lost'
  client_name       TEXT,
  therapeutic_area  TEXT,
  study_phase       TEXT,
  study_type        TEXT,
  indication        TEXT,
  description       TEXT,
  due_date          DATE,
  estimated_value   NUMERIC(15,2),
  currency          TEXT NOT NULL DEFAULT 'USD',
  services_requested TEXT[],
  is_archived       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,  -- NULL = active; non-null = soft-deleted
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposals_org_id     ON proposals(org_id);
CREATE INDEX idx_proposals_deleted_at ON proposals(deleted_at) WHERE deleted_at IS NULL;
