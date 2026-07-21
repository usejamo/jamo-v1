-- Phase 16 (Plan 02): Dedicated demo organization row (SPEC Decision A / CONTEXT D-08).
--
-- The demo runs in its OWN organizations row, marked feature_flags.is_demo = true. Because
-- private.get_user_org_id() returns this org for a signed-in presenter, every existing
-- org-scoped RLS policy and both proposal-retrieval RPCs filter to the demo org unmodified —
-- zero new cross-org policy surface, and the demo corpus is isolated by construction.
--
-- No schema change is needed: organizations.feature_flags jsonb already exists
-- (20260305000002_organizations.sql) and slug is UNIQUE, which is what makes this upsert safe.
--
-- Scope boundary: this migration creates the ORG ROW ONLY. The presenter super_admin ACCOUNT
-- is created by scripts/seed-demo-org.ts via the invite -> admin-API user creation -> accept
-- path (the same path every other account in this codebase takes). A raw insert into the
-- Supabase auth schema is never performed, in SQL or anywhere else.
--
-- Idempotent: safe to re-apply. The ON CONFLICT branch MERGES the is_demo flag into whatever
-- feature_flags the row already carries (|| jsonb concat) rather than replacing the object,
-- so re-application can never clobber flags set later by other phases (T-16-06).

INSERT INTO organizations (name, slug, plan, feature_flags)
VALUES ('Jamo Demo', 'jamo-demo', 'internal', '{"is_demo": true}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET feature_flags = organizations.feature_flags || '{"is_demo": true}'::jsonb,
      updated_at    = NOW();
