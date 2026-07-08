-- Migration: Phase 14.5 — versioned regulatory_documents parent table
-- Establishes the versioned regulatory tier with a stable, operator-supplied document_key
-- that is the resolution target for supersession and re-ingest. document_key is UNIQUE and
-- immutable (BEFORE UPDATE trigger) so supersedes/superseded_by and chunks.regulatory_document_id
-- FK targets can never dangle. Applied in Plan 03 (Wave 2).

CREATE TABLE regulatory_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_key     TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  agency           TEXT NOT NULL,
  therapeutic_area TEXT,
  phase            TEXT[],
  geography        TEXT[] NOT NULL,
  effective_date   DATE,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','withdrawn')),
  supersedes       UUID REFERENCES regulatory_documents(id),
  superseded_by    UUID REFERENCES regulatory_documents(id),
  source           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability guardrail: document_key is the logical-document identity and must never change,
-- even across re-ingest (which UPDATEs the parent row in place by id).
CREATE OR REPLACE FUNCTION private.enforce_regulatory_document_key_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_key <> OLD.document_key THEN
    RAISE EXCEPTION 'document_key is immutable (attempted % -> %)', OLD.document_key, NEW.document_key;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER regulatory_documents_document_key_immutable
  BEFORE UPDATE ON regulatory_documents
  FOR EACH ROW EXECUTE FUNCTION private.enforce_regulatory_document_key_immutable();
