-- Migration: Phase 14.5 — proposals.geography real column + one-time regions backfill
-- Adds a real geography text[] column and backfills EXISTING rows by parsing `regions` out of
-- the legacy {services, regions} JSON blob currently stuffed in proposals.description.
-- Write-side rewire + read-side repoint happen atomically in Plan 06 (no app code touched here).
-- Applied in Plan 03 (Wave 2).

ALTER TABLE proposals ADD COLUMN geography TEXT[];

-- One-time backfill: parse `regions` out of the legacy {services, regions} JSON blob
-- currently stuffed in proposals.description. Row-by-row with per-row exception handling
-- because some description values may be free text, not JSON.
DO $$
DECLARE
  r RECORD;
  regions_json JSONB;
BEGIN
  FOR r IN
    SELECT id, description FROM proposals
    WHERE description IS NOT NULL AND description ~ '^\s*\{'
  LOOP
    BEGIN
      regions_json := (r.description::jsonb -> 'regions');
      IF regions_json IS NOT NULL AND jsonb_typeof(regions_json) = 'array' THEN
        UPDATE proposals
          SET geography = ARRAY(SELECT jsonb_array_elements_text(regions_json))
          WHERE id = r.id;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'geography backfill: skipped proposal % (unparseable description)', r.id;
    END;
  END LOOP;
END $$;
