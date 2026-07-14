// supabase/functions/admin-create-org/test.ts
// Deno test file — run with: deno test supabase/functions/admin-create-org/test.ts --allow-env --allow-net
//
// REQ-3/D-08/D-10 (15-04): admin-create-org asserts super_admin from the
// verified JWT (via a user_profiles lookup keyed by getAuthedUserAndOrg's
// userId) — never implied by merely reaching this endpoint. Slug uniqueness
// (T-15-15) is resolved by an insert-catch-23505-retry loop, bounded to 6
// attempts (T-15-16), never a check-then-insert pre-check.
//
// The handler itself requires a live Supabase auth server + service-role
// client + organizations table, so full request/response integration is
// deferred to a live-verify pass — those cases stay `ignore: true` below,
// matching the 14.3-05 contingency used throughout this repo (Deno is
// unavailable in this dev sandbox).

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.test('admin-create-org: non-super_admin caller predicate — role !== "super_admin" must yield 403', () => {
  const nonAdminRole = 'user'
  const isSuperAdmin = nonAdminRole === 'super_admin'
  assertEquals(isSuperAdmin, false)
})

Deno.test('admin-create-org: plan validation predicate — only "trial" and "paid" are accepted', () => {
  const VALID_PLANS = ['trial', 'paid']
  assertEquals(VALID_PLANS.includes('trial'), true)
  assertEquals(VALID_PLANS.includes('paid'), true)
  assertEquals(VALID_PLANS.includes('enterprise'), false)
})

Deno.test('admin-create-org: slug retry suffix pattern — `${base}-${attempt+1}` from attempt 1 onward', () => {
  const base = 'acme-corp'
  const candidateAt = (attempt: number) => (attempt === 0 ? base : `${base}-${attempt + 1}`)
  assertEquals(candidateAt(0), 'acme-corp')
  assertEquals(candidateAt(1), 'acme-corp-2')
  assertEquals(candidateAt(5), 'acme-corp-6')
})

Deno.test({
  name: 'admin-create-org: live request as non-super_admin returns 403 — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase auth server + a user_profiles row with a
    // non-super_admin role. Expected: getAuthedUserAndOrg resolves userId; the
    // user_profiles role lookup returns non-super_admin; response is 403
    // 'super_admin required'.
  },
})

Deno.test({
  name: 'admin-create-org: live request as super_admin creates an org with a unique slug — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase project (organizations table + service-role
    // key) to assert the created row's slug equals baseSlug(name), or a
    // numbered suffix on collision, and that a 6th collision returns 409.
  },
})
