-- Usage tracking from day one (REQ-7.9)
-- Records every billable or analytically significant event
-- No hard delete — events are append-only for audit trail
CREATE TABLE usage_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  -- event_type values:
  --   'proposal_generated'   — full proposal generation triggered
  --   'section_generated'    — individual section generated
  --   'document_processed'   — file extraction completed
  --   'ai_chat_message'      — Jamo AI chat message sent
  --   'rag_query'            — regulatory chunk retrieval
  --   'export_generated'     — DOCX export downloaded
  proposal_id   UUID REFERENCES proposals(id) ON DELETE SET NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- metadata examples:
  --   {"model": "claude-sonnet-4-5", "tokens_in": 1200, "tokens_out": 4500}
  --   {"file_type": "pdf", "size_bytes": 204800}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on usage_events (org-scoped read; append-only via policy)
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_usage_events_org_id     ON usage_events(org_id);
CREATE INDEX idx_usage_events_created_at ON usage_events(created_at);
