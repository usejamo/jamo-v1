-- Phase 9: Add section targeting and message classification to proposal_chats
ALTER TABLE proposal_chats
  ADD COLUMN IF NOT EXISTS section_target_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat';

-- Add an index for efficient per-section chat history queries
CREATE INDEX IF NOT EXISTS idx_proposal_chats_section_target
  ON proposal_chats(proposal_id, section_target_id);
