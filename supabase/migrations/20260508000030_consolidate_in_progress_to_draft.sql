-- Consolidate in_progress into draft: both represent pre-submission work-in-progress.
-- After this migration the valid status values are: draft, submitted, won, lost.
UPDATE proposals
SET status = 'draft'
WHERE status = 'in_progress';

COMMENT ON COLUMN proposals.status IS 'Valid values: draft, submitted, won, lost';
