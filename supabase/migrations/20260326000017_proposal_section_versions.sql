CREATE TABLE proposal_section_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,
  content       TEXT NOT NULL,
  action_label  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_psv_section ON proposal_section_versions(proposal_id, section_key, created_at DESC);

ALTER TABLE proposal_section_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read own versions"
  ON proposal_section_versions FOR SELECT
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org members can insert own versions"
  ON proposal_section_versions FOR INSERT
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org members can delete own versions"
  ON proposal_section_versions FOR DELETE
  USING (org_id = get_user_org_id(auth.uid()));
