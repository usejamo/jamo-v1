-- Phase 14.2: Enable Realtime on chat_sessions for pending_actions and active_task live updates.
-- Required for ActionQueue (Part B) to update reactively without polling.
-- Security note: RLS policies with user_id = auth.uid() (migration 41) ensure per-user
-- Realtime isolation — clients only receive rows they own. REPLICA IDENTITY FULL is
-- required so Supabase Realtime payload.new includes JSONB columns like pending_actions.

-- Idempotent: only add if not already in publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'chat_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_sessions;
  END IF;
END;
$$;

-- Enable replica identity FULL so Realtime receives full row on UPDATE
-- Required for payload.new to include JSONB columns like pending_actions
ALTER TABLE chat_sessions REPLICA IDENTITY FULL;
