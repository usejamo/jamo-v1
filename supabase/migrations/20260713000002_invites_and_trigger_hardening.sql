-- Phase 15 Plan 01: Invites table + trigger hardening
--
-- 1. New `invites` table — single source of truth for org/role assignment (D-01).
-- 2. RLS on invites, same-org scoped only; NO super_admin bypass (D-08 — the only
--    existing cross-org bypass is orgs_super_admin on `organizations`; cross-org
--    admin ops go through service-role edge functions instead).
-- 3. `user_profiles.is_active` column (req 7 — denormalized fast-read mirror of
--    the auth.users ban state).
-- 4. New same-org admin UPDATE policy on user_profiles (today only self-update
--    exists) so org admins can manage teammates within their own org.
-- 5. Rewritten `handle_new_user()` trigger body — reads org/role ONLY from the
--    `invites` table by email, never from client-supplied `raw_user_meta_data`
--    (closes the req-12 tamper vector). Trigger definition itself is unchanged.

-- 1. invites table
CREATE TABLE invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'user')),
  invited_by   UUID REFERENCES auth.users(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invites_email_status ON invites (lower(email), status);
CREATE INDEX idx_invites_org_id ON invites (org_id);

-- 2. RLS on invites — same-org only, no super_admin bypass (D-08)
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_select_own_org" ON invites
  FOR SELECT TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "invites_insert_own_org" ON invites
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT private.get_user_org_id())
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  );

-- 3. user_profiles.is_active (req 7, Pitfall 3)
ALTER TABLE user_profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- 4. Same-org admin UPDATE policy on user_profiles (Pattern 2)
CREATE POLICY "profiles_admin_update_same_org" ON user_profiles
  FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  )
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

-- 5. Rewritten handle_new_user() body — trigger definition (on_auth_user_created
-- AFTER INSERT ON auth.users) is unchanged and NOT re-declared here.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  SELECT org_id, role INTO v_org_id, v_role
  FROM invites
  WHERE lower(email) = lower(NEW.email) AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  -- D-05: deliberate invariant — no auth user may exist without a pending invites row; do NOT add a fallback branch (SSO would add its own path).
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'no pending invite for %', NEW.email;
  END IF;

  INSERT INTO user_profiles (user_id, org_id, role, full_name)
  VALUES (NEW.id, v_org_id, v_role, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;
