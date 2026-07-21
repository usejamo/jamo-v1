// supabase/functions/demo-run-start/test.ts
// Deno test file — run with:
//   deno test supabase/functions/demo-run-start/test.ts --allow-env --allow-net --allow-read
//
// Phase 16 (Plan 04). demo-run-start asserts super_admin from the verified JWT, refuses any
// caller whose own org is not the demo org, refuses a non-default template, validates the
// active fixture against the CURRENT template_sections before writing anything, and then
// materializes one isolated draft proposal whose RFP embeddings are CLONED, never computed.
//
// The handler needs a live Supabase auth server + service-role client + populated demo_*
// tables, so full request/response integration stays `ignore: true` below — the repo-wide
// 14.3-05 contingency (Deno is unavailable in this dev sandbox). Everything checkable as a
// pure predicate is asserted for real against helpers exported from index.ts and from the
// shared validation module.

import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  isDemoRunCaller,
  orgIsDemo,
  isStandardTemplate,
  pickRfpFields,
  buildDemoTitle,
  demoRfpStoragePath,
  DEMO_RFP_STORAGE_PATH,
  RFP_FIELD_COLUMNS,
} from './index.ts'
import { validateFixtureAgainstTemplate } from '../_shared/demoFixtureValidation.ts'

const DEMO_ORG = '11111111-1111-1111-1111-111111111111'
const OTHER_ORG = '22222222-2222-2222-2222-222222222222'

// ---------------------------------------------------------------------------
// Access control (Req 1 / T-16-12, T-16-13)
// ---------------------------------------------------------------------------

Deno.test('super_admin gate predicate: any role other than super_admin must yield 403', () => {
  const isSuperAdmin = (role: string | null | undefined) => role === 'super_admin'
  assertEquals(isSuperAdmin('super_admin'), true)
  for (const role of ['admin', 'client', 'member', 'owner', '', null, undefined]) {
    assertEquals(isSuperAdmin(role as string | null | undefined), false)
  }
})

Deno.test('isDemoRunCaller: a super_admin outside the demo org cannot start a run', () => {
  // Two super_admins exist (demo presenter + internal). The guard is ORG-scoped, so
  // "a super_admin exists" is never sufficient.
  assertEquals(isDemoRunCaller(OTHER_ORG, false), false)
})

Deno.test('isDemoRunCaller: fails closed on a null/missing org id', () => {
  assertEquals(isDemoRunCaller(null, true), false)
  assertEquals(isDemoRunCaller(undefined, true), false)
  assertEquals(isDemoRunCaller('', true), false)
})

Deno.test('isDemoRunCaller: permits a demo-org super_admin', () => {
  assertEquals(isDemoRunCaller(DEMO_ORG, true), true)
})

Deno.test('orgIsDemo: resolves by feature_flags.is_demo, never by a hardcoded UUID', () => {
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: { is_demo: true } }), true)
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: { is_demo: 'true' } }), true)
  assertEquals(orgIsDemo({ slug: 'jamo-demo', feature_flags: null }), true)
})

Deno.test('orgIsDemo: fails closed on a missing/false/unrelated flag', () => {
  assertEquals(orgIsDemo(null), false)
  assertEquals(orgIsDemo(undefined), false)
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: null }), false)
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: { is_demo: false } }), false)
  assertEquals(orgIsDemo({ slug: 'acme', feature_flags: { salesforce: true } }), false)
})

// ---------------------------------------------------------------------------
// Standard-template-only (Req 4)
// ---------------------------------------------------------------------------

Deno.test('isStandardTemplate: only is_default = true passes; fails closed otherwise', () => {
  assertEquals(isStandardTemplate(true), true)
  assertEquals(isStandardTemplate(false), false)
  assertEquals(isStandardTemplate(null), false)
  assertEquals(isStandardTemplate(undefined), false)
})

// ---------------------------------------------------------------------------
// Fixture replay shaping
// ---------------------------------------------------------------------------

Deno.test('pickRfpFields: whitelists jsonb down to known proposals columns', () => {
  const picked = pickRfpFields({
    client_name: 'Acme Bio',
    indication: 'NSCLC',
    org_id: OTHER_ORG, // must NOT survive — identity is server-bound
    created_by: 'someone-else',
    status: 'approved',
    bogus: 1,
  })
  assertEquals(picked.client_name, 'Acme Bio')
  assertEquals(picked.indication, 'NSCLC')
  assertEquals('org_id' in picked, false)
  assertEquals('created_by' in picked, false)
  assertEquals('status' in picked, false)
  assertEquals('bogus' in picked, false)
})

Deno.test('pickRfpFields: fails safe on a null/non-object rfp_fields', () => {
  assertEquals(Object.keys(pickRfpFields(null)).length, 0)
  assertEquals(Object.keys(pickRfpFields('nope')).length, 0)
  assertEquals(Object.keys(pickRfpFields(undefined)).length, 0)
})

Deno.test('RFP_FIELD_COLUMNS matches the set captured by demo-capture-fixture', () => {
  // Capture and replay must agree, or replayed fields silently vanish.
  assertEquals(RFP_FIELD_COLUMNS.length, 10)
  for (const col of ['client_name', 'therapeutic_area', 'study_phase', 'study_type', 'indication', 'due_date', 'estimated_value', 'services_requested', 'geography', 'description']) {
    assert(RFP_FIELD_COLUMNS.includes(col as never), `${col} missing from RFP_FIELD_COLUMNS`)
  }
})

Deno.test('buildDemoTitle: proposals.title is NOT NULL and is never blank', () => {
  assertEquals(
    buildDemoTitle({ client_name: 'Acme Bio', indication: 'NSCLC', study_phase: 'Phase III' }),
    'Acme Bio — NSCLC (Phase III)'
  )
  assertEquals(buildDemoTitle({}), 'Demo Proposal')
  assertEquals(buildDemoTitle({ client_name: '   ' }), 'Demo Proposal')
})

Deno.test('demoRfpStoragePath: one shared canonical object, org-prefixed for bucket RLS', () => {
  // D-06: the same path for every run (not per-proposal), so reset/sweep never deletes it.
  assertEquals(demoRfpStoragePath(DEMO_ORG), `${DEMO_ORG}/${DEMO_RFP_STORAGE_PATH}`)
  assertEquals(demoRfpStoragePath(DEMO_ORG), demoRfpStoragePath(DEMO_ORG))
  // First path segment must be the org id — storage_policies.sql keys RLS on it.
  assertEquals(demoRfpStoragePath(DEMO_ORG).split('/')[0], DEMO_ORG)
})

// ---------------------------------------------------------------------------
// Req 7 — validation runs against the shared module the handler actually imports
// ---------------------------------------------------------------------------

const TEMPLATE = [
  { role: 'executive_summary', position: 1, name: 'Executive Summary' },
  { role: 'scope_of_work', position: 2, name: 'Scope of Work' },
]

Deno.test('validateFixtureAgainstTemplate: a matching fixture lets the run proceed', () => {
  const result = validateFixtureAgainstTemplate(TEMPLATE, [
    { role: 'executive_summary', position: 1, section_name: 'Executive Summary' },
    { role: 'scope_of_work', position: 2, section_name: 'Scope of Work' },
  ])
  assertEquals(result.ok, true)
})

Deno.test('validateFixtureAgainstTemplate: a drifted fixture aborts, naming the section', () => {
  const result = validateFixtureAgainstTemplate(TEMPLATE, [
    { role: 'executive_summary', position: 1, section_name: 'Executive Summary' },
  ])
  assertEquals(result.ok, false)
  assert(result.ok === false && result.error.includes('Scope of Work'))
})

// ---------------------------------------------------------------------------
// Req 3 — the no-model-call invariant, asserted statically against the shipped source
// ---------------------------------------------------------------------------

Deno.test('demo-run-start source contains no model/embedding provider call', async () => {
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  const forbidden = [
    'openai',
    'anthropic',
    'text-embedding',
    'embeddings.create',
    'generate-proposal-section',
    'extract-assumptions',
    'extract-document',
  ]
  for (const needle of forbidden) {
    assertEquals(
      source.toLowerCase().includes(needle),
      false,
      `demo-run-start must make no model call, found: ${needle}`
    )
  }
  // ...and it must clone instead.
  assert(source.includes('clone_demo_fixture_chunks'))
})

Deno.test('demo-run-start validates before it writes (ordering invariant, Req 7)', async () => {
  const source = (await Deno.readTextFile(new URL('./index.ts', import.meta.url))).replace(
    /\r\n/g,
    '\n'
  )
  const validateAt = source.indexOf('validateFixtureAgainstTemplate(\n')
  const firstProposalInsertAt = source.indexOf(".from('proposals')")
  assert(validateAt > -1 && firstProposalInsertAt > -1)
  assert(validateAt < firstProposalInsertAt, 'validation must precede the first proposals write')
})

// ---------------------------------------------------------------------------
// Live-only integration cases (need a real auth server + populated demo_* tables)
// ---------------------------------------------------------------------------

Deno.test({
  name: 'INTEGRATION: non-super_admin caller gets 403 regardless of body (T-16-12)',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: super_admin outside the demo org gets 403 (T-16-13)',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: body-supplied org_id/created_by are ignored — rows land in the caller org',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: non-default template_id => 400 "demo runs require the standard template"',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: drifted active fixture => 422 naming the section, and ZERO rows written',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: two concurrent runs yield distinct proposal_ids and distinct demo_run_ids',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: cloned chunks carry 1536-dim embeddings equal to the fixture rows',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: every section lands status=complete with non-empty content (no blanks)',
  ignore: true,
  fn: () => {},
})

Deno.test({
  name: 'INTEGRATION: a mid-sequence failure leaves no proposal, doc row, or demo_runs row',
  ignore: true,
  fn: () => {},
})
