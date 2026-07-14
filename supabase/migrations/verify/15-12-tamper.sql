-- Phase 15 Plan 01 / Task 3 — req-12 tamper-proofing verification checklist.
--
-- MANUAL-ONLY (per 15-VALIDATION.md § Manual-Only, 15-12 row). This requires a
-- live database plus a hostile auth.admin.createUser payload — it is NOT a
-- Vitest/Deno unit test. Run this against the live hosted project
-- (fuuvdcvbliijffogjnwg) via Supabase MCP `execute_sql` (steps a/c/d) plus one
-- `auth.admin.createUser` call from a trusted script or the dashboard (step b),
-- AFTER the migration in 20260713000002_invites_and_trigger_hardening.sql has
-- been applied live.
--
-- Threat covered: T-15-01 (Tampering/EoP — handle_new_user must read org/role
-- ONLY from the invites table, never from client-supplied raw_user_meta_data)
-- and T-15-02 (EoP — no auth user may exist without a pending invites row).

-- ============================================================
-- Assertion 1: tampered payload is ignored (org/role bound server-side)
-- ============================================================

-- (a) Seed a pending invite for the tamper-test email, Org A + role 'user'.
-- Replace :org_a_id with a real organizations.id before running.
INSERT INTO invites (email, org_id, role, status)
VALUES ('tamper-test@example.com', :'org_a_id', 'user', 'pending');

-- (b) OUT OF BAND: via a trusted script or the Supabase dashboard, call
--   auth.admin.createUser({
--     email: 'tamper-test@example.com',
--     password: '<test-password>',
--     email_confirm: true,
--     user_metadata: { org_id: '<ORG_B_ID>', role: 'admin', full_name: 'Tamper Test' }
--   })
-- i.e. the invitee-controlled raw_user_meta_data claims a DIFFERENT org (Org B)
-- and an elevated role ('admin') than the pending invite (Org A / 'user').

-- (c) Assert the resulting user_profiles row was bound from the invites row,
-- NOT the hostile raw_user_meta_data. This query must return exactly one row
-- with org_id = :org_a_id and role = 'user' (Org B / 'admin' must NOT appear).
SELECT up.user_id, up.org_id, up.role, up.full_name
FROM user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE u.email = 'tamper-test@example.com';
-- Expected: 1 row, org_id = :org_a_id, role = 'user'.
-- full_name = 'Tamper Test' is fine (cosmetic-only field, never org/role — req 12).

-- Cleanup after assertion 1:
-- DELETE FROM invites WHERE email = 'tamper-test@example.com';
-- (dashboard) delete the auth user created in step (b).

-- ============================================================
-- Assertion 2: no pending invite -> RAISE EXCEPTION, insert rolls back
-- ============================================================

-- (d) Confirm there is NO pending invite for this email:
SELECT * FROM invites WHERE lower(email) = lower('no-invite-test@example.com') AND status = 'pending';
-- Expected: 0 rows.

-- OUT OF BAND: attempt auth.admin.createUser({ email: 'no-invite-test@example.com', ... })
-- with no matching pending invite. Expected: the auth.users insert fails and rolls
-- back with an error containing "no pending invite for no-invite-test@example.com"
-- (see the RAISE EXCEPTION in handle_new_user(), migration 20260713000002, and the
-- D-05 invariant comment beside it). No user_profiles row, and no auth.users row,
-- should exist for this email afterward.

-- Confirm no residue:
SELECT * FROM auth.users WHERE email = 'no-invite-test@example.com';
-- Expected: 0 rows (the trigger RAISE rolled back the entire auth.users insert).
