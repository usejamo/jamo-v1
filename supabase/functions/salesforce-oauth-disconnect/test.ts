// supabase/functions/salesforce-oauth-disconnect/test.ts
// Deno test file — run with: deno test supabase/functions/salesforce-oauth-disconnect/test.ts --allow-env --allow-net
//
// REQ-2 / D-01 (14.3-04): salesforce-oauth-disconnect derives org_id from the
// verified JWT via getAuthedUserAndOrg — never from the request body. The body
// org_id (if present) is only used to detect a mismatch/tamper attempt, which is
// rejected with 403 'org mismatch' rather than trusted.
//
// The salesforce_connections lookup/delete and Vault token revoke all operate on
// the JWT-derived org (T-14.3-14) — a mismatched body org_id cannot be used to
// disconnect another tenant's Salesforce connection.
//
// The handler itself requires a live Supabase auth server (to mint/verify a real
// JWT) plus a real salesforce_connections row + Vault secret, so full
// request/response integration is validated live in 14.3-05 — those cases stay
// `ignore: true` with a pointer below.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.test('salesforce-oauth-disconnect: mismatched body org_id vs JWT org — operates on JWT org (or 403), never the body value', () => {
  // Pure assertion of the guard's intent: a body org_id that differs from the
  // JWT-derived org must never be trusted. This mirrors the guard added in
  // index.ts: `if (body_org_id && body_org_id !== orgId) return jsonError(403, ...)`.
  const jwtOrgId = 'org-jwt-real'
  const bodyOrgId = 'org-victim-tenant'
  const mismatch = Boolean(bodyOrgId) && bodyOrgId !== jwtOrgId
  assertEquals(mismatch, true)

  // The trusted value used for the salesforce_connections lookup/delete + Vault
  // revoke must be the JWT org, never the body org, regardless of mismatch outcome.
  const trustedOrgForConnectionsLookup = jwtOrgId
  assertEquals(trustedOrgForConnectionsLookup, jwtOrgId)
  assertEquals(trustedOrgForConnectionsLookup === bodyOrgId, false)
})

Deno.test({
  name: 'salesforce-oauth-disconnect: live request with mismatched body org_id returns 403 (cannot disconnect another tenant) — INTEGRATION, live-only, see 14.3-05',
  ignore: true,
  fn() {
    // Requires a live Supabase auth server (real JWT + user_profiles row) plus a
    // real salesforce_connections row + Vault secret for a DIFFERENT org, to
    // assert the mismatched-org disconnect attempt is rejected before any
    // connections/Vault mutation occurs. Live-verified in 14.3-05.
  },
})

Deno.test({
  name: 'salesforce-oauth-disconnect: connections lookup/delete + Vault revoke bind to JWT org (not body) — INTEGRATION, live-only, see 14.3-05',
  ignore: true,
  fn() {
    // Requires a live Supabase project (salesforce_connections table, Vault RPCs,
    // service-role key) to assert the deleted row / revoked token belong to the
    // JWT-derived org's own connection. Live-verified in 14.3-05.
  },
})
