-- verify-write-gating.sql
-- Phase 14.7 (Proposal-History Scoping), Plan 03/06 — live verification of the
-- admin-gated write RPCs authored in 20260710000004_eligibility_write_gating.sql.
--
-- Run via Supabase MCP `execute_sql` in Plan 07 AFTER the migration is applied (Plan 06).
-- MCP `execute_sql` connects as `service_role`, which BYPASSES RLS and has `auth.uid()`
-- return NULL by default. The RPCs here do not depend on RLS, but they DO depend on
-- `auth.uid()` to resolve the caller's identity/role, so each block below sets the
-- `request.jwt.claims` GUC via `set_config(...)` to simulate an authenticated caller
-- for the duration of the transaction, then ROLLBACKs so no state is left behind.
--
-- BEFORE RUNNING: replace the placeholder ids below with real ids from this org's data:
--   <ADMIN_USER_ID>      - a user_profiles row with role IN ('admin','super_admin')
--   <NON_ADMIN_USER_ID>  - a user_profiles row with role = 'user' (e.g. usera@jamo.com, per MEMORY)
--   <ORG_A_ID>           - the org_id of the admin/non-admin users above
--   <PROPOSAL_IN_ORG_A>  - a proposals.id belonging to ORG_A
--   <PROPOSAL_IN_ORG_B>  - a proposals.id belonging to a DIFFERENT org (cross-org target)
--
-- Discover candidates with:
--   SELECT user_id, org_id, role FROM user_profiles ORDER BY role;
--   SELECT id, org_id, status FROM proposals ORDER BY org_id LIMIT 20;

-- ============================================================
-- Check 0: sanity — both RPCs exist
-- ============================================================
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN ('set_reference_override', 'set_org_learning_switches');
-- expect 2 rows

-- ============================================================
-- Check 1 (POSITIVE): admin context — set_org_learning_switches succeeds
-- ============================================================
BEGIN;
  SELECT set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_USER_ID>')::text, true);
  SET LOCAL role authenticated;

  SELECT set_org_learning_switches(true, true, false);

  SELECT learn_from_won, learn_from_submitted, learn_from_lost
  FROM organizations WHERE id = '<ORG_A_ID>';
  -- expect: learn_from_won = true, learn_from_submitted = true, learn_from_lost = false
ROLLBACK;

-- ============================================================
-- Check 2 (NEGATIVE): non-admin denied — set_org_learning_switches raises 'not authorized'
-- ============================================================
BEGIN;
  SELECT set_config('request.jwt.claims', json_build_object('sub', '<NON_ADMIN_USER_ID>')::text, true);
  SET LOCAL role authenticated;

  SELECT set_org_learning_switches(true, true, true);
  -- expect: ERROR: not authorized
ROLLBACK;

-- ============================================================
-- Check 3 (NEGATIVE): non-admin denied — set_reference_override raises 'not authorized'
--
-- Note: this is the enforcement point that closes RESEARCH Pitfall 3. `proposals_update`
-- RLS remains intentionally broad (org_id = get_user_org_id(), no role check) for
-- legitimate status/title edits by any org member — that policy is NOT modified by this
-- phase. The confidentiality boundary on `reference_override` is enforced HERE, at the
-- RPC, because the UI is required to write this field ONLY via set_reference_override,
-- never a raw `.update()`. This check proves a non-admin cannot use the RPC bypass.
-- ============================================================
BEGIN;
  SELECT set_config('request.jwt.claims', json_build_object('sub', '<NON_ADMIN_USER_ID>')::text, true);
  SET LOCAL role authenticated;

  SELECT set_reference_override('<PROPOSAL_IN_ORG_A>', true);
  -- expect: ERROR: not authorized
ROLLBACK;

-- ============================================================
-- Check 4 (CROSS-ORG): admin of org A cannot write a proposal belonging to org B
-- ============================================================
BEGIN;
  SELECT set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_USER_ID>')::text, true);
  SET LOCAL role authenticated;

  -- capture org B's value before the attempt
  SELECT reference_override AS org_b_before FROM proposals WHERE id = '<PROPOSAL_IN_ORG_B>';

  SELECT set_reference_override('<PROPOSAL_IN_ORG_B>', true);
  -- no exception is raised (org A admin IS authorized in general) — but the UPDATE's
  -- WHERE clause (org_id = caller's org) matches 0 rows because the proposal belongs
  -- to a different org.

  SELECT reference_override AS org_b_after FROM proposals WHERE id = '<PROPOSAL_IN_ORG_B>';
  -- expect: org_b_after IS NOT DISTINCT FROM org_b_before (unchanged — 0 rows affected)
ROLLBACK;

-- ============================================================
-- Check 5 (POSITIVE): admin context — set_reference_override succeeds within own org
-- ============================================================
BEGIN;
  SELECT set_config('request.jwt.claims', json_build_object('sub', '<ADMIN_USER_ID>')::text, true);
  SET LOCAL role authenticated;

  SELECT set_reference_override('<PROPOSAL_IN_ORG_A>', true);

  SELECT reference_override FROM proposals WHERE id = '<PROPOSAL_IN_ORG_A>';
  -- expect: true
ROLLBACK;

-- ============================================================
-- Fallback (if request.jwt.claims / SET LOCAL role simulation is not honored by the
-- MCP execute_sql connection in Plan 07 — e.g. if PostgREST-specific GUCs aren't
-- readable by auth.uid() outside a real PostgREST request context):
--
-- Manual UAT fallback for Plan 07:
--   1. Log in to the app as a NON-ADMIN user (e.g. usera@jamo.com / password123, per
--      MEMORY local-app-debug-setup).
--   2. Open a proposal's browser devtools console and run:
--        await supabase.rpc('set_reference_override', { p_proposal_id: '<id>', p_value: true })
--      Expect: error containing "not authorized".
--   3. Log in as an org-admin user, repeat step 2 on a proposal in their own org.
--      Expect: success (no error), and the value persists on reload.
--   4. As the same org-admin, repeat step 2 with a proposal id known to belong to a
--      DIFFERENT org. Expect: no error (RPC doesn't raise for cross-org — the WHERE
--      clause silently matches 0 rows), and the other org's value is confirmed
--      unchanged via a service-role read.
-- ============================================================
