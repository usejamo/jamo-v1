CREATE TABLE document_extracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES proposal_documents(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  page_count    INTEGER,
  word_count    INTEGER,
  parsed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parse_error   TEXT  -- NULL if successful
);
CREATE INDEX idx_document_extracts_document_id ON document_extracts(document_id);
