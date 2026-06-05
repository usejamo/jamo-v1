-- 14.2.3 cleanup: drop the temporary diagnostic table created during empty-queue
-- debugging. The edge function no longer writes to it (TEMP instrumentation reverted
-- in commit restructuring buildResolvedBlock to a terse demoted dedup appendix).
DROP TABLE IF EXISTS public._gap_debug;
