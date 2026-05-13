CREATE TABLE chat_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id            uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id                 uuid NOT NULL REFERENCES organizations(id),
  current_focus_section  text DEFAULT NULL,
  active_task            jsonb DEFAULT NULL,
  pending_actions        jsonb DEFAULT '[]'::jsonb,
  resolved_items         jsonb DEFAULT '[]'::jsonb,
  last_updated           timestamptz DEFAULT now(),
  created_at             timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX chat_sessions_proposal_id_idx ON chat_sessions (proposal_id);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_sessions_org_isolation" ON chat_sessions
  FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);
