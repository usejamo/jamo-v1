CREATE TABLE proposal_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposal_id   UUID REFERENCES proposals(id) ON DELETE SET NULL,
  uploaded_by   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  storage_path  TEXT NOT NULL,  -- Supabase Storage path: {org_id}/{proposal_id}/{filename}
  mime_type     TEXT NOT NULL,
  size_bytes    BIGINT,
  doc_type      TEXT,
  -- doc_type values: 'rfp', 'protocol', 'transcript', 'budget', 'template'
  parse_status  TEXT NOT NULL DEFAULT 'pending',
  -- parse_status values: 'pending', 'extracting', 'complete', 'error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proposal_documents_org_id      ON proposal_documents(org_id);
CREATE INDEX idx_proposal_documents_proposal_id ON proposal_documents(proposal_id);
