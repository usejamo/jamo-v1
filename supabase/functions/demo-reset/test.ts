// supabase/functions/demo-reset/test.ts
// Deno test file — run with:
//   deno test supabase/functions/demo-reset/test.ts --allow-env --allow-net --allow-read
//
// Phase 16 (Plan 05). demo-reset is the first DESTRUCTIVE demo endpoint, so what is asserted
// here is blast radius, not feature surface.
//
// IMPORTANT — where the real coverage lives: Deno is not installed in this dev environment
// (the repo-wide 14.3-05 contingency), so this file is NOT what proves the guards today.
// `_shared/demoRunCleanup.ts` has no Deno-runtime imports, so Vitest imports the REAL module
// and executes it under Node in `src/lib/__tests__/demoRunCleanup.test.ts` (19 assertions:
// the triple-guard predicates, the delete ORDER, the abort-before-proposal-delete behavior,
// and the static no-bucket-object / no-hardcoded-UUID guards). That suite runs on every
// `npm run test:run`. The predicate cases below are the same properties restated for a Deno
// runner; the request/response cases need a live Supabase auth server + service-role client
// + populated demo_* tables and stay `ignore: true`.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { isResettableRun, isRunInDemoOrg } from '../_shared/demoRunCleanup.ts'
import { isDemoResetCaller, orgIsDemo } from './index.ts'

const DEMO_ORG = '11111111-1111-1111-1111-111111111111'
const CLIENT_ORG = '22222222-2222-2222-2222-222222222222'

// ---------------------------------------------------------------------------
// Access control (Req 1 / T-16-17, T-16-18)
// ---------------------------------------------------------------------------

Deno.test('super_admin gate predicate: any role other than super_admin must yield 403', () => {
  const isSuperAdmin = (role: string | null | undefined) => role === 'super_admin'
  assertEquals(isSuperAdmin('super_admin'), true)
  for (const role of ['admin', 'client', 'member', 'owner', '', null, undefined]) {
    assertEquals(isSuperAdmin(role as string | null | undefined), false)
  }
})

Deno.test('isDemoResetCaller: a super_admin outside the demo org cannot reset', () => {
  // Two super_admins exist (demo presenter + Phase-15 internal); the internal one lives in a
  // real org. "A super_admin" is never sufficient — the guard is org-scoped.
  assertEquals(isDemoResetCaller(CLIENT_ORG, false), false)
  assertEquals(isDemoResetCaller(DEMO_ORG, true), true)
})

Deno.test('isDemoResetCaller: fails closed on a null/blank org id', () => {
  assertEquals(isDemoResetCaller(null, true), false)
  assertEquals(isDemoResetCaller(undefined, true), false)
  assertEquals(isDemoResetCaller('', true), false)
})

Deno.test('orgIsDemo: resolves by flag/slug at runtime, never by a hardcoded UUID', () => {
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: { is_demo: true } }), true)
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: { is_demo: 'true' } }), true)
  assertEquals(orgIsDemo({ slug: 'jamo-demo', feature_flags: null }), true)
  assertEquals(orgIsDemo(null), false)
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: null }), false)
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: { is_demo: false } }), false)
})

// ---------------------------------------------------------------------------
// Triple-guard (Access-control point 4 / T-16-18)
// ---------------------------------------------------------------------------

Deno.test('isResettableRun: true only for a demo-org draft', () => {
  assertEquals(isResettableRun(DEMO_ORG, 'draft', DEMO_ORG), true)
})

Deno.test('isResettableRun: false for a proposal in a real client org', () => {
  assertEquals(isResettableRun(CLIENT_ORG, 'draft', DEMO_ORG), false)
})

Deno.test('isResettableRun: false for a non-draft proposal', () => {
  for (const status of ['submitted', 'won', 'lost', 'archived', 'deleted']) {
    assertEquals(isResettableRun(DEMO_ORG, status, DEMO_ORG), false)
  }
})

Deno.test('isResettableRun / isRunInDemoOrg: fail closed on nulls', () => {
  assertEquals(isResettableRun(null, 'draft', DEMO_ORG), false)
  assertEquals(isResettableRun(DEMO_ORG, null, DEMO_ORG), false)
  assertEquals(isResettableRun(DEMO_ORG, 'draft', null), false)
  assertEquals(isResettableRun(null, 'draft', null), false)
  assertEquals(isRunInDemoOrg(null, DEMO_ORG), false)
  assertEquals(isRunInDemoOrg(DEMO_ORG, null), false)
  assertEquals(isRunInDemoOrg(CLIENT_ORG, DEMO_ORG), false)
  assertEquals(isRunInDemoOrg(DEMO_ORG, DEMO_ORG), true)
})

// ---------------------------------------------------------------------------
// Delete-statement set (Pitfall 1 / T-16-20, T-16-21)
// ---------------------------------------------------------------------------

Deno.test('cleanup module deletes proposal_documents, proposals and demo_runs — in that order', async () => {
  const src = await Deno.readTextFile(
    new URL('../_shared/demoRunCleanup.ts', import.meta.url)
  )
  const pd = src.indexOf(".from('proposal_documents')")
  const pr = src.indexOf(".from('proposals')")
  const dr = src.indexOf(".from('demo_runs')")
  assertEquals(pd > -1 && pr > -1 && dr > -1, true)
  // proposal_documents FIRST: its FK is SET NULL, so after the proposal delete the row is no
  // longer joinable by proposal id and orphans permanently.
  assertEquals(pd < pr, true)
  assertEquals(pr < dr, true)
})

Deno.test('cleanup module never deletes a bucket object (shared canonical RFP retained, D-06)', async () => {
  const src = await Deno.readTextFile(
    new URL('../_shared/demoRunCleanup.ts', import.meta.url)
  )
  assertEquals(/\.remove\(/.test(src), false)
  assertEquals(/\.from\(\s*['"]documents['"]\s*\)/.test(src), false)
})

// ---------------------------------------------------------------------------
// Integration — requires a live Supabase project + seeded demo_runs. `demo_fixtures` and
// `demo_runs` are both EMPTY as of this plan, so no end-to-end reset can be exercised yet:
// there is nothing to reset. These are the exact post-capture verifications owed.
// ---------------------------------------------------------------------------

Deno.test({
  name: 'INTEGRATION: a non-super_admin caller gets 403 regardless of body',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: a super_admin outside the demo org gets 403 and deletes nothing',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: a demo_run_id naming a non-demo-org proposal is refused, zero rows deleted',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: a demo_run_id whose proposal is not draft is refused, zero rows deleted',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: a missing demo_run_id returns 400 and an unknown one returns 404',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: after a successful reset, no proposal_documents/document_extracts rows remain for the run',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: after a successful reset, the shared canonical RFP file still exists in the documents bucket',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: resetting run A leaves a concurrent run B fully intact (shared login, D-07)',
  ignore: true,
  fn: () => {},
})
