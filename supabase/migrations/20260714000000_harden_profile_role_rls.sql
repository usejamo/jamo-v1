-- Phase 15 security fix — code review CR-01 (critical) + WR-01 (warning).
--
-- Problem: two live UPDATE policies on user_profiles allowed a client to set
-- role = 'super_admin', and the invites INSERT policy allowed minting a
-- 'super_admin' invite row from the client — all violating the phase invariant
-- "an authenticated client can never self-assign org/role or mint super_admin".
--
--   1. profiles_admin_update_same_org — WITH CHECK never constrained `role`, so a
--      same-org admin could UPDATE any same-org profile (incl. their own) to
--      role='super_admin'.
--   2. profiles_update (pre-existing self-update) — WITH CHECK was NULL, so Postgres
--      reuses the USING clause (user_id = auth.uid()) as the check, leaving `role`
--      and `org_id` unconstrained: ANY authenticated user could self-escalate.
--   3. invites_insert_own_org — WITH CHECK never constrained `role`, so a client
--      could insert a pending 'super_admin' invite row.
--
-- Fix strategy: cap the client-reachable surface. Service-role edge functions
-- (team-manage, admin-invite-first-admin, admin-invites-lifecycle, bootstrap) and
-- the handle_new_user SECURITY DEFINER trigger all bypass RLS, so legitimate
-- super_admin provisioning is unaffected — these caps only bind direct client writes.
--
-- private.get_user_role()/get_user_org_id() are STABLE SQL SECURITY DEFINER reading
-- user_profiles for auth.uid(); inside a WITH CHECK on an UPDATE they observe the
-- pre-UPDATE (committed) snapshot, so pinning role/org_id to them prevents a
-- self-update from changing those columns.

-- 1. Self-update: pin role + org_id to the caller's current values (no self-escalation,
--    no org hop). Non-privileged fields (full_name, is_active for self, etc.) still update.
DROP POLICY IF EXISTS "profiles_update" ON user_profiles;
CREATE POLICY "profiles_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND role = (SELECT private.get_user_role())
    AND org_id = (SELECT private.get_user_org_id())
  );

-- 2. Same-org admin update: allow member management but cap the resulting role to
--    non-privileged roles — org admins can move teammates between admin/user, never
--    to/from super_admin, and cannot modify a super_admin's row via the client.
DROP POLICY IF EXISTS "profiles_admin_update_same_org" ON user_profiles;
CREATE POLICY "profiles_admin_update_same_org" ON user_profiles
  FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  )
  WITH CHECK (
    org_id = (SELECT private.get_user_org_id())
    AND role IN ('admin', 'user')
  );

-- 3. Invite insert: cap client-mintable invite role to non-super_admin.
DROP POLICY IF EXISTS "invites_insert_own_org" ON invites;
CREATE POLICY "invites_insert_own_org" ON invites
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT private.get_user_org_id())
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
    AND role IN ('admin', 'user')
  );
