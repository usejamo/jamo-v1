-- Migration: Phase 14.5 — chunks global regulatory tier + tier-pairing CHECK + regulatory-read RLS
-- Adds the FK from chunks to the versioned parent, makes org_id nullable so a global regulatory
-- tier (org_id NULL) is possible, and enforces tier integrity via a CHECK. Adds a clean
-- defense-in-depth RLS SELECT policy for global regulatory chunks. Applied in Plan 03 (Wave 2).

ALTER TABLE chunks ADD COLUMN regulatory_document_id UUID REFERENCES regulatory_documents(id) ON DELETE CASCADE;
ALTER TABLE chunks ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE chunks ADD CONSTRAINT chunks_tier_pairing CHECK (
  (org_id IS NOT NULL AND regulatory_document_id IS NULL)
  OR (regulatory_document_id IS NOT NULL)
);

CREATE INDEX idx_chunks_regulatory_document_id ON chunks(regulatory_document_id);

-- Defense-in-depth: allow any authenticated user to SELECT global regulatory chunks.
-- Clean FOR SELECT TO authenticated shape — deliberately NOT modeled on the broken
-- chunks_org_isolation policy (its profile-table join is defective). Additive; that policy untouched.
CREATE POLICY "chunks_regulatory_read" ON chunks
  FOR SELECT TO authenticated
  USING (doc_type = 'regulatory' AND org_id IS NULL);
