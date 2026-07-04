// supabase/functions/_shared/auth.test.ts
// Deno test file — run with: deno test supabase/functions/_shared/auth.test.ts --allow-env
//
// Covers the two PURE functions exported from auth.ts: isInternalServiceRoleCall
// and jsonError. getAuthedUserAndOrg's network path (auth.getUser() +
// user_profiles lookup) requires a live Supabase auth server and is validated
// live in plan 14.3-05 instead — these tests run with no network.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { isInternalServiceRoleCall, jsonError } from './auth.ts'

Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-sr-key')

Deno.test('isInternalServiceRoleCall: true when bearer matches SUPABASE_SERVICE_ROLE_KEY', () => {
  const req = new Request('http://x', {
    headers: { Authorization: 'Bearer test-sr-key' },
  })
  assertEquals(isInternalServiceRoleCall(req), true)
})

Deno.test('isInternalServiceRoleCall: false for a user JWT', () => {
  const req = new Request('http://x', {
    headers: { Authorization: 'Bearer some.user.jwt' },
  })
  assertEquals(isInternalServiceRoleCall(req), false)
})

Deno.test('isInternalServiceRoleCall: false when Authorization header is absent', () => {
  const req = new Request('http://x')
  assertEquals(isInternalServiceRoleCall(req), false)
})

Deno.test('jsonError: returns given status and {error} JSON body with Content-Type', async () => {
  const res = jsonError(401, 'Unauthorized', {})
  assertEquals(res.status, 401)
  assertEquals(res.headers.get('Content-Type'), 'application/json')
  const body = await res.json()
  assertEquals(body.error, 'Unauthorized')
})

Deno.test('jsonError: merges provided CORS headers', () => {
  const res = jsonError(403, 'Forbidden', { 'Access-Control-Allow-Origin': '*' })
  assertEquals(res.status, 403)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*')
})
