-- Phase 14.2.3: persist the whole-proposal content hash alongside pending_actions.
-- Nullable — existing rows are NULL, treated by the client mount gate as "no prior
-- analysis → run it" (identical code path to a hash mismatch). Written atomically
-- with pending_actions in the analyze-proposal-gaps upsert so the two never desync.
-- chat_sessions already has RLS + chat_sessions_org_isolation; ADD COLUMN inherits
-- existing RLS and column grants — no new policy or GRANT needed.
ALTER TABLE chat_sessions ADD COLUMN pending_actions_content_hash text;
