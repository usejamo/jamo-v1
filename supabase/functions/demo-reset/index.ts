// supabase/functions/demo-reset/index.ts
// Phase 16 (Plan 05) — the first DESTRUCTIVE endpoint in the demo path.
//
// Takes the session's `demo_run_id` (SPEC Req 8 / CONTEXT D-10: run-scoped and supplied by
// the client, then verified server-side — never inferred from the account, because the demo
// login is SHARED and two presenters may hold two live runs at once) and hard-deletes that
// one run: its proposal, every cascaded child, its `proposal_documents` row (+ cascaded
// `document_extracts`), and its `demo_runs` row.
//
// Blast-radius discipline (Access-control point 4, threats T-16-17/T-16-18/T-16-21):
//   - Identity comes ONLY from the verified JWT. Nothing in the body is trusted as identity.
//   - super_admin is re-read from `user_profiles` by the verified user id => 403 otherwise.
//   - The caller's OWN org must be the demo org, resolved at runtime by the
//     `feature_flags.is_demo` flag / `jamo-demo` slug — NEVER a hardcoded UUID. Role alone is
//     insufficient: a second super_admin exists and lives in a real internal org, and a
//     role-only gate would let that account point this endpoint at a real client proposal.
//   - TRIPLE-GUARD before a single row is deleted: the `demo_runs` row is registered to the
//     demo org, AND its proposal is in the demo org, AND that proposal is still `status =
//     'draft'`. Any leg unproven => refuse and delete NOTHING (fail closed).
//   - The shared canonical demo RFP file object is referenced by every run and owned by none
//     (D-06). No teardown path here or in the shared cleanup deletes it.
//
// Deletion itself is delegated to `_shared/demoRunCleanup.ts` so the scheduled sweep
// (Plan 16-06) reuses this exact routine instead of a second, divergent one.
//
// The in-session, no-page-reload return to the pre-upload start is the frontend's job
// (Plan 16-09, CONTEXT D-11). This function just returns `{ ok: true }`.
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'
import { cleanupDemoRun, isResettableRun, isRunInDemoOrg } from '../_shared/demoRunCleanup.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Runtime demo-org resolution: flagged `feature_flags.is_demo` (canonical) or the reserved
 * `jamo-demo` slug. NEVER a hardcoded UUID. Byte-equivalent to demo-run-start's copy — the
 * Deno runtime cannot import across function directories for a single-file deploy unit, and
 * demo-run-start's copy is not importable here without coupling two deploy units.
 * Exported for unit testing.
 */
export function orgIsDemo(
  org: { slug?: string | null; feature_flags?: unknown } | null | undefined
): boolean {
  if (!org) return false
  const flags = (org.feature_flags ?? null) as Record<string, unknown> | null
  if (flags && (flags.is_demo === true || flags.is_demo === 'true')) return true
  return org.slug === 'jamo-demo'
}

/**
 * A reset may only be issued by a super_admin whose OWN org is the demo org. Fails closed on
 * a missing org id. Exported for unit testing.
 */
export function isDemoResetCaller(
  callerOrgId: string | null | undefined,
  callerOrgIsDemo: boolean
): boolean {
  if (!callerOrgId) return false
  return callerOrgIsDemo === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // T-16-17: identity from the verified JWT only. Any user_id/org_id in the body is ignored.
    let userId: string
    try {
      ;({ userId } = await getAuthedUserAndOrg(req, corsHeaders))
    } catch (e) {
      if (e instanceof Response) return e
      throw e
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // `user_profiles.id` (the profile PK) is what demo_runs.started_by references — not
    // auth.users(id) — so the profile row is the authoritative source for role and org here.
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('id, role, org_id')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'super_admin required', corsHeaders)
    }
    const callerOrgId: string = callerProfile.org_id

    const { data: callerOrg } = await admin
      .from('organizations')
      .select('id, slug, feature_flags')
      .eq('id', callerOrgId)
      .single()
    if (!isDemoResetCaller(callerOrgId, orgIsDemo(callerOrg))) {
      // T-16-18: the internal super_admin sits in a real org. A role-only gate would let this
      // endpoint be aimed at a real client proposal.
      return jsonError(403, 'demo reset is only permitted from the demo org', corsHeaders)
    }

    // ---- Run-scoped target (D-10) -------------------------------------------
    // The id comes from the CLIENT SESSION and is untrusted; it is verified below. It is
    // deliberately NOT resolved from the account ("the caller's current run"), because the
    // demo login is shared and that lookup would be ambiguous — and, worse, could pick up a
    // different presenter's live run.
    const body = (await req.json().catch(() => ({}))) as { demo_run_id?: string }
    const demoRunId = typeof body?.demo_run_id === 'string' ? body.demo_run_id.trim() : ''
    if (!demoRunId) {
      return jsonError(400, 'demo_run_id is required', corsHeaders)
    }

    const { data: run, error: runError } = await admin
      .from('demo_runs')
      .select('id, proposal_id, org_id')
      .eq('id', demoRunId)
      .maybeSingle()
    if (runError) return jsonError(500, runError.message, corsHeaders)
    if (!run) return jsonError(404, 'demo run not found', corsHeaders)

    const { data: proposal, error: proposalError } = await admin
      .from('proposals')
      .select('id, org_id, status')
      .eq('id', run.proposal_id)
      .maybeSingle()
    if (proposalError) return jsonError(500, proposalError.message, corsHeaders)

    // ---- TRIPLE-GUARD: prove the target, or delete nothing -------------------
    // 1. the demo_runs row is registered to the demo org (membership),
    // 2. the proposal is in the demo org,
    // 3. the proposal is still a draft.
    // A single unproven leg refuses the whole request. Note this guard is intentionally
    // "IS a draft demo run in the demo org", not per-user ownership: under the shared demo
    // login ownership is unverifiable (D-07/D-10), so cross-run reset between two presenters
    // is an accepted, bounded risk (T-16-19) — everything reachable is inside the demo org.
    const runInDemoOrg = isRunInDemoOrg(run.org_id as string | null, callerOrgId)
    const proposalResettable = isResettableRun(
      (proposal?.org_id ?? null) as string | null,
      (proposal?.status ?? null) as string | null,
      callerOrgId
    )
    if (!runInDemoOrg || !proposalResettable) {
      return jsonError(403, 'reset refused: not a resettable demo run', corsHeaders)
    }

    // Deletion order is load-bearing and lives in ONE place — see _shared/demoRunCleanup.ts.
    // It throws rather than partially succeeding.
    try {
      await cleanupDemoRun(admin, {
        id: run.id as string,
        proposal_id: run.proposal_id as string,
        org_id: callerOrgId,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'demo run cleanup failed'
      return jsonError(500, message, corsHeaders)
    }

    return new Response(JSON.stringify({ ok: true, demo_run_id: run.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (_error) {
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
