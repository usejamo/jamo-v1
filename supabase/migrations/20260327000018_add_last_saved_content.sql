-- Add last_saved_content to proposal_sections for TipTap autosave tracking
ALTER TABLE proposal_sections ADD COLUMN IF NOT EXISTS last_saved_content TEXT;
