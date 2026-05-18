-- Phase 14.2 — D-44/D-45/D-46/D-47: Per-user chat_sessions schema
-- D-44: Add user_id column to chat_sessions (UUID, references auth.users)
-- D-45: Change PK to composite (proposal_id, user_id) — one session per user per proposal
-- D-46: Create pending_action_dismissals table for persistent dismiss state
-- D-47: Update RLS to include user_id = auth.uid() predicate (USING AND WITH CHECK)
--
-- Session identity: one chat_session per (user_id, proposal_id) composite PK.
-- This contract is relied upon by Plans 06 (upsert onConflict: 'proposal_id,user_id')
-- and 07 (fetch filter .eq('proposal_id', id).eq('user_id', userId)).

-- Step 1: Add user_id column (nullable first for backfill compatibility)
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Backfill existing rows — assign to the proposal owner
UPDATE chat_sessions cs
SET user_id = p.created_by
FROM proposals p
WHERE cs.proposal_id = p.id
  AND cs.user_id IS NULL
  AND p.created_by IS NOT NULL;

-- Step 3: Set NOT NULL only if all rows are backfilled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM chat_sessions WHERE user_id IS NULL
  ) THEN
    ALTER TABLE chat_sessions ALTER COLUMN user_id SET NOT NULL;
  END IF;
END;
$$;

-- Migration verification (acceptance criterion): confirm zero NULL user_id rows remain
-- Run manually after migration on seeded data:
-- SELECT COUNT(*) FROM chat_sessions WHERE user_id IS NULL; -- must return 0

-- Step 4: Drop existing PK and unique index, then add composite PK (proposal_id, user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'chat_sessions'::regclass
      AND contype = 'p'
      AND array_length(conkey, 1) = 2
  ) THEN
    -- Drop the unique index on proposal_id that was used as single-user PK
    DROP INDEX IF EXISTS chat_sessions_proposal_id_idx;
    ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_pkey;
    ALTER TABLE chat_sessions ADD PRIMARY KEY (proposal_id, user_id);
  END IF;
END;
$$;

-- Step 5: Update RLS policies — BOTH USING and WITH CHECK include user_id = auth.uid() (D-47)
-- This provides Realtime isolation: clients only receive events for rows they own.
DROP POLICY IF EXISTS "chat_sessions_org_isolation" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_select" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update" ON chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_delete" ON chat_sessions;

CREATE POLICY "chat_sessions_select" ON chat_sessions
  FOR SELECT USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND user_id = auth.uid()
  );

CREATE POLICY "chat_sessions_insert" ON chat_sessions
  FOR INSERT WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND user_id = auth.uid()
  );

CREATE POLICY "chat_sessions_update" ON chat_sessions
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND user_id = auth.uid()
  )
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND user_id = auth.uid()
  );

CREATE POLICY "chat_sessions_delete" ON chat_sessions
  FOR DELETE USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND user_id = auth.uid()
  );

-- Step 6: Create pending_action_dismissals table (D-46)
CREATE TABLE IF NOT EXISTS pending_action_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  content_hash TEXT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, user_id, action_id)
);

ALTER TABLE pending_action_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dismissals_select" ON pending_action_dismissals
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "dismissals_insert" ON pending_action_dismissals
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "dismissals_delete" ON pending_action_dismissals
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_dismissals_proposal_user
  ON pending_action_dismissals (proposal_id, user_id);
