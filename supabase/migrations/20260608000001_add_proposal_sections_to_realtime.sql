-- 14.2.3 fix: proposal_sections was never added to the supabase_realtime publication, so the
-- gap-analysis D-30 realtime trigger (postgres_changes UPDATE on proposal_sections, in
-- useGapAnalysisTrigger.ts) never received any events. A freshly generated proposal therefore
-- got NO gap analysis until a manual page reload (which fires the separate mount-path trigger),
-- because the mount path runs once while sections are still empty and never re-fires when
-- generation populates content. Publishing the table lets those content UPDATEs drive the
-- debounced re-analysis as the code already intends. RLS still gates which rows each client
-- receives (owner/org only). Mirrors chat_sessions, which is already published and whose
-- filtered (proposal_id) subscription works with default replica identity.
ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_sections;
