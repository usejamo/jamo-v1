CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'trial',
  -- plan values: 'trial', 'starter', 'pro', 'enterprise'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Feature flag examples: {"ai_chat": true, "rag_enabled": false, "max_proposals": 10}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
