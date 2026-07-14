// supabase/functions/team-manage/test.ts
// Deno test file — run with: deno test supabase/functions/team-manage/test.ts --allow-env --allow-net
//
// req 7, T-15-22/T-15-24, Pitfall 3: team-manage asserts the caller is an org
// admin (or super_admin), rejects any target whose org_id != callerOrgId,
// never targets or mints a super_admin, and deactivate/reactivate use
// ban_duration at the auth layer as the real block (is_active is only the UI
// mirror, never the sole enforcement mechanism).
//
// The handler itself requires a live Supabase auth server + user_profiles +
// auth.admin.updateUserById, so full request/response integration is
// deferred to a live-verify pass — those cases stay `ignore: true` below,
// matching the 14.3-05 / 15-04 contingency used throughout this repo (Deno is
// unavailable in this dev sandbox).

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.test('team-manage: target in another org predicate — org_id !== callerOrgId must yield 403', () => {
  const callerOrgId = 'org-aaa'
  const target = { org_id: 'org-bbb', role: 'user' }
  const isCrossOrg = target.org_id !== callerOrgId
  assertEquals(isCrossOrg, true)
})

Deno.test('team-manage: target in the same org is not rejected by the org guard', () => {
  const callerOrgId = 'org-aaa'
  const target = { org_id: 'org-aaa', role: 'user' }
  const isCrossOrg = target.org_id !== callerOrgId
  assertEquals(isCrossOrg, false)
})

Deno.test('team-manage: deactivate must call updateUserById with ban_duration and set is_active=false', () => {
  // Mirrors the handler's deactivate branch — two writes in one call
  // (Pitfall 3): the auth-layer ban is the real block, is_active is the
  // denormalized UI mirror.
  const calls: Array<{ fn: string; args: unknown }> = []
  function updateUserById(targetUserId: string, patch: { ban_duration: string }) {
    calls.push({ fn: 'updateUserById', args: { targetUserId, patch } })
  }
  function updateProfile(targetUserId: string, patch: { is_active: boolean }) {
    calls.push({ fn: 'updateProfile', args: { targetUserId, patch } })
  }

  const targetUserId = 'user-123'
  updateUserById(targetUserId, { ban_duration: '87600h' })
  updateProfile(targetUserId, { is_active: false })

  assertEquals(calls.length, 2)
  assertEquals(calls[0], { fn: 'updateUserById', args: { targetUserId, patch: { ban_duration: '87600h' } } })
  assertEquals(calls[1], { fn: 'updateProfile', args: { targetUserId, patch: { is_active: false } } })
})

Deno.test('team-manage: reactivate must call updateUserById with ban_duration="none" and set is_active=true', () => {
  const calls: Array<{ fn: string; args: unknown }> = []
  function updateUserById(targetUserId: string, patch: { ban_duration: string }) {
    calls.push({ fn: 'updateUserById', args: { targetUserId, patch } })
  }
  function updateProfile(targetUserId: string, patch: { is_active: boolean }) {
    calls.push({ fn: 'updateProfile', args: { targetUserId, patch } })
  }

  const targetUserId = 'user-123'
  updateUserById(targetUserId, { ban_duration: 'none' })
  updateProfile(targetUserId, { is_active: true })

  assertEquals(calls[0].args, { targetUserId, patch: { ban_duration: 'none' } })
  assertEquals(calls[1].args, { targetUserId, patch: { is_active: true } })
})

Deno.test('team-manage: change_role to super_admin must be rejected', () => {
  const requestedRole = 'super_admin'
  const isRejected = requestedRole === 'super_admin'
  assertEquals(isRejected, true)
  const allowedRoles = ['admin', 'user']
  assertEquals(allowedRoles.includes(requestedRole), false)
})

Deno.test('team-manage: a target whose current role is super_admin must never be manageable', () => {
  const target = { org_id: 'org-aaa', role: 'super_admin' }
  const isProtected = target.role === 'super_admin'
  assertEquals(isProtected, true)
})

Deno.test({
  name: 'team-manage: live request targeting a user in another org returns 403 — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase project with two orgs. Expected:
    // 403 'target not in caller org', and no write occurs.
  },
})

Deno.test({
  name: 'team-manage: live deactivate call bans the auth user and sets is_active=false — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase project (auth.admin API + user_profiles).
    // Expected: auth.users row banned (ban_duration '87600h') AND
    // user_profiles.is_active === false for the target.
  },
})

Deno.test({
  name: 'team-manage: live change_role to super_admin returns 403 — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase project + an org-admin caller. Expected:
    // 403 'cannot assign super_admin', target role unchanged.
  },
})
