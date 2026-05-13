ALTER TABLE proposal_chats
  ADD COLUMN tool_data JSONB DEFAULT NULL;

COMMENT ON COLUMN proposal_chats.tool_data IS
  'Structured tool result payload for AI tool-use messages. NULL for plain chat messages. '
  'Shape varies by message_type: tool-propose-edit, tool-answer-cited, tool-compliance, etc.';
