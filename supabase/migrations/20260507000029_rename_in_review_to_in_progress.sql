-- Phase 13: Rename proposal status 'in_review' → 'in_progress'
-- The status column is TEXT (not an enum), so this is a data migration only.
-- No ALTER TYPE required.

UPDATE proposals
SET status = 'in_progress'
WHERE status = 'in_review';

COMMENT ON COLUMN proposals.status IS
  'Lifecycle status. Values: draft | in_progress | submitted | won | lost';
