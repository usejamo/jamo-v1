// supabase/functions/_shared/demoRunCleanup.ts
// Phase 16 (Plan 05) — the ONE implementation of demo-run teardown.
//
// Both `demo-reset` (presenter-triggered, one run) and the abandoned-run sweep (Plan 16-06,
// scheduled, many runs) call `cleanupDemoRun`. It lives here so a second, divergent copy is
// never written: a teardown that forgets one of the three steps below silently leaks rows
// forever, and the leak is invisible until the tables are inspected months later.
//
// ---------------------------------------------------------------------------------------
// WHY STEP 1 EXISTS — do not "optimize" it away (16-RESEARCH Pitfall 1, SPEC Decision C)
// ---------------------------------------------------------------------------------------
// Deleting a `proposals` row CASCADES these children (verified in the migrations):
//     proposal_sections, proposal_assumptions, chunks(proposal_id), proposal_chats,
//     chat_sessions, proposal_section_versions, demo_runs(proposal_id)
// It does NOT cascade `proposal_documents`. That FK is:
//     proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL
//         -- supabase/migrations/20260305000006_proposal_documents.sql:4
// so a proposal delete merely NULLs the pointer and the row SURVIVES as an orphan, taking
// its `document_extracts` child with it (document_extracts.document_id -> proposal_documents
// ON DELETE CASCADE, 20260305000007:3). Every demo run would leave one orphaned document row
// plus its extracted RFP text behind (threat T-16-20).
//
// The delete therefore has to happen FIRST, while `proposal_documents.proposal_id` still
// points at the proposal — once the proposal is gone the pointer is NULL and the orphan is
// no longer reachable by proposal id at all.
//
// `usage_events.proposal_id` is also SET NULL and is deliberately LEFT ALONE — it is billing
// telemetry, not per-run demo state.
//
// ---------------------------------------------------------------------------------------
// WHAT THIS MODULE MUST NEVER DELETE (CONTEXT D-06)
// ---------------------------------------------------------------------------------------
// The demo RFP file object in the `documents` bucket is ONE shared canonical artifact that
// every run REFERENCES and no run OWNS. Deleting it would silently break every future demo.
// This module performs DB deletes only and never touches any bucket object — for the run's
// own row that is the correct behavior, and for the sweep it is equally correct.
//
// ---------------------------------------------------------------------------------------
// FK ASSUMPTIONS THIS ORDER DEPENDS ON (each verified against the committed migrations)
// ---------------------------------------------------------------------------------------
//   proposal_documents.proposal_id -> proposals(id)          ON DELETE SET NULL   (must be explicit)
//   document_extracts.document_id  -> proposal_documents(id) ON DELETE CASCADE    (step 1 covers it)
//   demo_runs.proposal_id          -> proposals(id)          ON DELETE CASCADE    (step 2 covers it)
//   chunks.proposal_id             -> proposals(id)          ON DELETE CASCADE    (step 2 covers it)
// Because `demo_runs.proposal_id` cascades, step 3 is normally a no-op after step 2. It is
// kept, and run last, so the routine is still correct (and idempotent) for a `demo_runs` row
// whose proposal was already deleted by some other path — the sweep will meet exactly that.

/**
 * Minimal structural type so this module does not depend on a generated Database type and
 * stays usable from any demo edge function. The builder returned by supabase-js is a
 * thenable PostgrestFilterBuilder, not a bare Promise, so it is intentionally left loose
 * here rather than mis-modelled — the shape actually used is
 * `admin.from(table).delete().eq(column, value)` awaited for `{ error }`.
 */
// deno-lint-ignore no-explicit-any
type AdminClient = { from: (table: string) => any }

export type DemoRunRef = {
  id: string
  proposal_id: string
  org_id: string
}

/**
 * Pure triple-guard predicate (the proposal half). A run is resettable ONLY if its proposal
 * lives in the demo org AND is still a draft. Fails closed on null/blank/unknown input: a
 * reset that cannot PROVE its target is a demo draft must delete nothing.
 *
 * Note this deliberately does not accept a "status is close enough" notion — a demo proposal
 * is never moved off `draft` by any demo-path code (SPEC Req 9), so anything else means the
 * id does not belong to a live demo run and the caller is refused.
 */
export function isResettableRun(
  proposalOrgId: string | null | undefined,
  proposalStatus: string | null | undefined,
  demoOrgId: string | null | undefined
): boolean {
  if (!proposalOrgId || !demoOrgId) return false
  if (proposalOrgId !== demoOrgId) return false
  return proposalStatus === 'draft'
}

/**
 * The remaining leg of the triple-guard: the `demo_runs` row itself must be registered to the
 * demo org. Guards against a forged id naming a run row that was somehow written elsewhere.
 * Fails closed on nulls.
 */
export function isRunInDemoOrg(
  runOrgId: string | null | undefined,
  demoOrgId: string | null | undefined
): boolean {
  if (!runOrgId || !demoOrgId) return false
  return runOrgId === demoOrgId
}

/**
 * Hard-deletes one demo run's state. CALLERS MUST HAVE ALREADY PASSED THE TRIPLE-GUARD —
 * this routine performs no authorization of its own and will delete whatever it is handed.
 *
 * Throws on the first failed delete rather than continuing. In particular, if step 1 fails
 * we must NOT go on to step 2: deleting the proposal at that point would strand the document
 * row permanently (its proposal_id would be NULLed and no longer joinable).
 */
export async function cleanupDemoRun(admin: AdminClient, run: DemoRunRef): Promise<void> {
  // 1. delete from proposal_documents where proposal_id = run.proposal_id
  //    (cascades document_extracts). MUST precede the proposals delete — SET NULL, not cascade.
  const { error: docError } = await admin
    .from('proposal_documents')
    .delete()
    .eq('proposal_id', run.proposal_id)
  if (docError) {
    throw new Error(`demo run cleanup failed deleting proposal_documents: ${docError.message}`)
  }

  // 2. delete from proposals where id = run.proposal_id
  //    (cascades sections, assumptions, cloned chunks, chats, chat_sessions, section_versions,
  //    and the demo_runs row itself).
  const { error: proposalError } = await admin
    .from('proposals')
    .delete()
    .eq('id', run.proposal_id)
  if (proposalError) {
    throw new Error(`demo run cleanup failed deleting proposal: ${proposalError.message}`)
  }

  // 3. delete from demo_runs where id = run.id
  //    Normally a no-op (cascaded by step 2); kept so the routine is idempotent and still
  //    correct for an already-orphaned run row.
  const { error: runError } = await admin.from('demo_runs').delete().eq('id', run.id)
  if (runError) {
    throw new Error(`demo run cleanup failed deleting demo_runs row: ${runError.message}`)
  }
}
