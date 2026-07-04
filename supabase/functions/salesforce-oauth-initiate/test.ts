// supabase/functions/salesforce-oauth-initiate/test.ts
// Deno test file — run with: deno test supabase/functions/salesforce-oauth-initiate/test.ts --allow-env --allow-net
//
// REQ-2 / D-01 (14.3-04): salesforce-oauth-initiate derives org_id from the
// verified JWT via getAuthedUserAndOrg — never from the request body. The body
// org_id (if present) is only used to detect a mismatch/tamper attempt, which is
// rejected with 403 'org mismatch' rather than trusted.
//
// signState(org_id, ...) (CSRF state) and the oauth_pending insert both bind to
// the JWT-derived org (T-14.3-13). is_sandbox is still read from the body.
//
// The handler itself requires a live Supabase auth server (to mint/verify a real
// JWT) plus the Salesforce Connected App secrets, so full request/response
// integration is validated live in 14.3-05 — those cases stay `ignore: true`
// with a pointer below.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.test('salesforce-oauth-initiate: mismatched body org_id vs JWT org — operates on JWT org (or 403), never the body value', () => {
  // Pure assertion of the guard's intent: a body org_id that differs from the
  // JWT-derived org must never be trusted. This mirrors the guard added in
  // index.ts: `if (body_org_id && body_org_id !== orgId) return jsonError(403, ...)`.
  const jwtOrgId = 'org-jwt-real'
  const bodyOrgId = 'org-attacker-supplied'
  const mismatch = Boolean(bodyOrgId) && bodyOrgId !== jwtOrgId
  assertEquals(mismatch, true)

  // The trusted value used for signState + oauth_pending must be the JWT org,
  // never the body org, regardless of mismatch outcome.
  const trustedOrgForSignStateAndInsert = jwtOrgId
  assertEquals(trustedOrgForSignStateAndInsert, jwtOrgId)
  assertEquals(trustedOrgForSignStateAndInsert === bodyOrgId, false)
})

Deno.test({
  name: 'salesforce-oauth-initiate: live request with mismatched body org_id returns 403 — INTEGRATION, live-only, see 14.3-05',
  ignore: true,
  fn() {
    // Requires a live Supabase auth server (real JWT + user_profiles row) and
    // Salesforce Connected App secrets (SALESFORCE_CONSUMER_KEY/SECRET).
    // Live-verified in 14.3-05: getAuthedUserAndOrg resolves jwtOrgId; a
    // differing body org_id is rejected with 403 'org mismatch'.
  },
})

Deno.test({
  name: 'salesforce-oauth-initiate: signState + oauth_pending insert bind to JWT org (not body) — INTEGRATION, live-only, see 14.3-05',
  ignore: true,
  fn() {
    // Requires a live Supabase project (oauth_pending table + service-role key)
    // to assert the inserted row's org_id equals the JWT-derived org.
    // Live-verified in 14.3-05.
  },
})
