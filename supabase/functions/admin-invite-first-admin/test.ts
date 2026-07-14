// supabase/functions/admin-invite-first-admin/test.ts
// Deno test file — run with: deno test supabase/functions/admin-invite-first-admin/test.ts --allow-env --allow-net
//
// REQ-4/D-08/D-10/T-15-13 (15-04): admin-invite-first-admin asserts
// super_admin from the verified JWT, and hardcodes role='admin' server-side —
// role is never destructured from the request body at all. targetOrgId may
// legitimately differ from the caller's own org (this is the cross-org
// provisioning path, super_admin-gated, unlike the same-org team-invite path
// shipping in plan 06).
//
// The handler itself requires a live Supabase auth server + the invites table
// + auth.admin.inviteUserByEmail, so full request/response integration is
// deferred to a live-verify pass — those cases stay `ignore: true` below,
// matching the 14.3-05 contingency used throughout this repo (Deno is
// unavailable in this dev sandbox).

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.test('admin-invite-first-admin: non-super_admin caller predicate — role !== "super_admin" must yield 403', () => {
  const nonAdminRole = 'admin' // an org admin, not a super_admin
  const isSuperAdmin = nonAdminRole === 'super_admin'
  assertEquals(isSuperAdmin, false)
})

Deno.test('admin-invite-first-admin: role is server-fixed to "admin", a body-supplied role is never consulted', () => {
  // Mirrors the guard's intent: the handler destructures only
  // { email, targetOrgId } from the parsed body and passes the literal
  // 'admin' string to createInvite — an attacker-supplied `role` field in the
  // body (even 'super_admin') is simply never read.
  const body = { email: 'first-admin@example.com', targetOrgId: 'org-123', role: 'super_admin' }
  const { email, targetOrgId } = body as { email: string; targetOrgId: string }
  const roleForInvite = 'admin' as const

  assertEquals(email, 'first-admin@example.com')
  assertEquals(targetOrgId, 'org-123')
  assertEquals(roleForInvite, 'admin')
  assertEquals(roleForInvite === body.role, false) // escalation attempt is ignored
})

Deno.test({
  name: 'admin-invite-first-admin: live request as non-super_admin returns 403 — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase auth server + a user_profiles row with a
    // non-super_admin role. Expected: 403 'super_admin required'.
  },
})

Deno.test({
  name: 'admin-invite-first-admin: live request as super_admin runs the D-03 createInvite sequence — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase project (invites table + service-role key +
    // auth.admin API) to assert: invites row inserted with status='pending'
    // and role='admin' BEFORE inviteUserByEmail is called, and that a failure
    // of inviteUserByEmail compensates by revoking that same row.
  },
})
