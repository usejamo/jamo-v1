ALTER TABLE proposal_sections
  ADD COLUMN IF NOT EXISTS compliance_flags JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN proposal_sections.compliance_flags IS 'Array of ComplianceFlag objects: [{id, section_key, type, message, source}]';
