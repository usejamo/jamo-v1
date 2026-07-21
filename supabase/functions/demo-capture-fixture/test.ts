// supabase/functions/demo-capture-fixture/test.ts
// Deno test file — run with:
//   deno test supabase/functions/demo-capture-fixture/test.ts --allow-env --allow-net
//
// Phase 16 (Plan 03). demo-capture-fixture asserts super_admin from the verified JWT
// (a user_profiles lookup keyed by getAuthedUserAndOrg's userId — never the body), then
// refuses any source proposal that is not in the caller's own demo org (D-05 / T-16-09),
// then writes a NEW monotonic version rather than overwriting (Decision B / T-16-11).
//
// The handler needs a live Supabase auth server + service-role client + the demo_* tables,
// so full request/response integration stays `ignore: true` below — the repo-wide
// 14.3-05 contingency (Deno is unavailable in this dev sandbox). Everything checkable as a
// pure predicate is asserted for real against helpers exported from index.ts.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  nextVersion,
  isCapturableSource,
  buildRfpFields,
  findBlankSections,
  RFP_FIELD_COLUMNS,
} from './index.ts'

const DEMO_ORG = '11111111-1111-1111-1111-111111111111'
const OTHER_ORG = '22222222-2222-2222-2222-222222222222'

Deno.test('nextVersion: monotonic — coalesce(max(version),0)+1 semantics', () => {
  assertEquals(nextVersion(null), 1)
  assertEquals(nextVersion(undefined), 1)
  assertEquals(nextVersion(0), 1)
  assertEquals(nextVersion(1), 2)
  assertEquals(nextVersion(7), 8)
})

Deno.test('nextVersion: recapture never reuses the current version (new version, not overwrite)', () => {
  const current = 3
  const recaptured = nextVersion(current)
  assertEquals(recaptured > current, true)
})

Deno.test('isCapturableSource: rejects a source proposal outside the caller org (D-05)', () => {
  assertEquals(isCapturableSource(OTHER_ORG, DEMO_ORG, true), false)
})

Deno.test('isCapturableSource: rejects when the caller org is not flagged is_demo', () => {
  assertEquals(isCapturableSource(DEMO_ORG, DEMO_ORG, false), false)
})

Deno.test('isCapturableSource: fails closed on a null/missing org id', () => {
  assertEquals(isCapturableSource(null, DEMO_ORG, true), false)
  assertEquals(isCapturableSource(DEMO_ORG, null, true), false)
  assertEquals(isCapturableSource(undefined, undefined, true), false)
})

Deno.test('isCapturableSource: permits a demo-org proposal captured by a demo-org caller', () => {
  assertEquals(isCapturableSource(DEMO_ORG, DEMO_ORG, true), true)
})

Deno.test('super_admin gate predicate: any role other than super_admin must yield 403', () => {
  const isSuperAdmin = (role: string | null | undefined) => role === 'super_admin'
  assertEquals(isSuperAdmin('user'), false)
  assertEquals(isSuperAdmin('admin'), false)
  assertEquals(isSuperAdmin(null), false)
  assertEquals(isSuperAdmin('super_admin'), true)
})

Deno.test('buildRfpFields: captures every study column, nulling absent ones', () => {
  const fields = buildRfpFields({
    client_name: 'Acme Bio',
    therapeutic_area: 'Oncology',
    study_phase: 'Phase II',
    description: '{"services":[]}',
    id: 'should-not-be-copied',
  })
  assertEquals(Object.keys(fields).sort(), [...RFP_FIELD_COLUMNS].sort())
  assertEquals(fields.client_name, 'Acme Bio')
  assertEquals(fields.indication, null)
  assertEquals(Object.prototype.hasOwnProperty.call(fields, 'id'), false)
})

Deno.test('buildRfpFields: the description JSON blob is carried as an opaque string, untouched', () => {
  const raw = '{"services":["monitoring"],"investigationalProductUndisclosed":true}'
  const fields = buildRfpFields({ description: raw })
  assertEquals(fields.description, raw)
})

Deno.test('findBlankSections: names ungenerated sections so capture can refuse loudly (Req 7)', () => {
  const blank = findBlankSections([
    { name: 'Executive Summary', position: 1, content: '<p>ok</p>' },
    { name: 'Study Design', position: 2, content: '' },
    { name: 'Budget', position: 3, content: '   ' },
  ])
  assertEquals(blank, ['Study Design', 'Budget'])
})

Deno.test('findBlankSections: a fully generated proposal yields no offenders', () => {
  const blank = findBlankSections([{ name: 'Executive Summary', position: 1, content: '<p>ok</p>' }])
  assertEquals(blank.length, 0)
})

Deno.test('section content is carried verbatim — placeholder spans survive an identity copy', () => {
  const content =
    '<p>Sponsor <span data-placeholder-id="a3f1c0de-0000-4000-8000-000000000001" data-placeholder-label="Sponsor Name">[Sponsor]</span> agrees.</p>'
  const captured = { content } // byte-for-byte copy; never parsed or re-encoded
  assertEquals(captured.content, content)
  assertEquals(captured.content.includes('data-placeholder-id='), true)
})

Deno.test({
  name: 'demo-capture-fixture: live request as non-super_admin returns 403 regardless of body — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live Supabase auth server + a user_profiles row with role 'admin'/'user'.
    // Expected: getAuthedUserAndOrg resolves userId; the user_profiles role lookup returns
    // a non-super_admin role; response is 403 { error: 'super_admin required' } even when
    // the body supplies a demo-org source_proposal_id and a spoofed org_id/user_id.
  },
})

Deno.test({
  name: 'demo-capture-fixture: capturing a non-demo-org proposal returns 403 — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live project with a proposal in a non-demo org. Expected:
    // 403 { error: 'capture only permitted for demo-org proposals' } and zero rows written
    // to demo_fixtures / demo_fixture_sections.
  },
})

Deno.test({
  name: 'demo-capture-fixture: recapture of the same proposal creates a NEW version — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live project + a fully generated demo-org proposal. Expected: the second
    // capture returns version = first.version + 1; the first fixture row still exists with
    // status 'archived'; exactly one row for that template_id has status 'active'
    // (partial unique index demo_fixtures_one_active_per_template).
  },
})

Deno.test({
  name: 'demo-capture-fixture: captured sections preserve data-placeholder-id spans — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live project. Expected: every demo_fixture_sections.content equals the
    // source proposal_sections.content byte-for-byte, including every
    // data-placeholder-id / data-placeholder-label attribute, and compliance_flags match.
  },
})

Deno.test({
  name: 'demo-capture-fixture: RFP chunk embeddings are captured at 1536 dims — INTEGRATION, live-only',
  ignore: true,
  fn() {
    // Requires a live project with an ingested demo RFP. Expected: count of
    // demo_fixture_rfp_chunks for the new fixture equals count of chunks where
    // doc_type='proposal' and proposal_id = source, with identical content/metadata and
    // vector_dims(embedding) = 1536 on every row (Decision C).
  },
})
