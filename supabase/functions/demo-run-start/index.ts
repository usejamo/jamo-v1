// supabase/functions/demo-run-start/index.ts
// Phase 16 (Plan 04) — the heart of Token-Free Demo Mode.
//
// Materializes ONE fresh, isolated, fully pre-populated draft proposal in the demo org
// from the active fixture, and makes ZERO model/LLM/embedding provider calls doing it:
//   - section content comes from demo_fixture_sections (captured, verbatim HTML)
//   - assumptions come from demo_fixture_assumptions
//   - RFP text comes from demo_fixtures.rfp_extract_text
//   - RFP embeddings are CLONED by the clone_demo_fixture_chunks RPC (Decision C) —
//     the vectors already exist; nothing is embedded at run time.
// INVARIANT (grep-enforced): no model-provider SDK, no embedding endpoint, and no
// invocation of any generation/extraction edge function may appear in this file. The
// names are deliberately not spelled out here so the negative grep that guards this
// invariant stays clean — see test.ts and the Req 3 check in 16-VALIDATION.md.
//
// Security posture (SPEC Req 1/4/5, Access-control point 3, threats T-16-12..T-16-16):
//   - Identity comes ONLY from the verified JWT (getAuthedUserAndOrg) — never the body.
//   - Role re-read from user_profiles by verified user id; non-super_admin => 403.
//   - The caller's org must itself be the demo org (resolved at runtime by the
//     feature_flags.is_demo flag / slug — NEVER a hardcoded UUID), so a super_admin
//     sitting in a real client org cannot spray demo content into it.
//   - org_id and created_by are bound server-side from that verified caller.
//
// Req 7: the fixture is validated against the CURRENT template_sections BEFORE the first
// write. A drifted fixture aborts with 422 and a named section, rather than rendering a
// blank section mid-demo.
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'
import { validateFixtureAgainstTemplate } from '../_shared/demoFixtureValidation.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * D-06: the demo RFP is ONE shared canonical Storage object referenced by every run,
 * never a per-run upload and never deleted by reset/sweep. It is stored org-relative
 * because the `documents` bucket's RLS keys on the first path segment being the caller's
 * org id (20260305000014_storage_policies.sql), so the full path is composed at runtime
 * from the verified caller's org — the demo org UUID is never hardcoded.
 */
export const DEMO_RFP_STORAGE_PATH = 'demo/canonical-demo-rfp.pdf'
export const DEMO_RFP_DOCUMENT_NAME = 'Demo RFP.pdf'
export const DEMO_RFP_MIME_TYPE = 'application/pdf'

export function demoRfpStoragePath(orgId: string): string {
  return `${orgId}/${DEMO_RFP_STORAGE_PATH}`
}

/** Rows inserted per batch (cloned assumption/section counts are small, but bound anyway). */
const INSERT_BATCH_SIZE = 100

/** Study/RFP columns replayed from demo_fixtures.rfp_fields onto the new proposals row. */
export const RFP_FIELD_COLUMNS = [
  'client_name',
  'therapeutic_area',
  'study_phase',
  'study_type',
  'indication',
  'due_date',
  'estimated_value',
  'services_requested',
  'geography',
  'description',
] as const

/**
 * Whitelists the fixture's rfp_fields jsonb down to known proposals columns. A fixture is
 * super_admin-authored data, but it is still jsonb: never spread it straight into an insert.
 * Exported for unit testing.
 */
export function pickRfpFields(rfpFields: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!rfpFields || typeof rfpFields !== 'object') return out
  const src = rfpFields as Record<string, unknown>
  for (const col of RFP_FIELD_COLUMNS) {
    if (src[col] !== undefined && src[col] !== null) out[col] = src[col]
  }
  return out
}

/**
 * `proposals.title` is NOT NULL but is not part of the captured rfp_fields, so it is
 * derived the same way ProposalCreationWizard derives it. Exported for unit testing.
 */
export function buildDemoTitle(rfpFields: Record<string, unknown>): string {
  const client = typeof rfpFields.client_name === 'string' ? rfpFields.client_name.trim() : ''
  const indication = typeof rfpFields.indication === 'string' ? rfpFields.indication.trim() : ''
  const phase = typeof rfpFields.study_phase === 'string' ? rfpFields.study_phase.trim() : ''
  const parts = [client, indication].filter(Boolean).join(' — ')
  const suffix = phase ? ` (${phase})` : ''
  const title = `${parts}${suffix}`.trim()
  return title || 'Demo Proposal'
}

/**
 * T-16-13 / Access-control point 3: a run may only be materialized by a super_admin whose
 * OWN org is the demo org. Guarding on "is a super_admin" alone is not enough — more than
 * one super_admin exists, and the other one lives in a real internal org. Fails closed on
 * nulls, mirroring isCapturableSource in demo-capture-fixture. Exported for unit testing.
 */
export function isDemoRunCaller(
  callerOrgId: string | null | undefined,
  callerOrgIsDemo: boolean
): boolean {
  if (!callerOrgId) return false
  return callerOrgIsDemo === true
}

/**
 * Runtime demo-org resolution: flagged `feature_flags.is_demo` (canonical) or the
 * reserved `jamo-demo` slug. NEVER a hardcoded UUID. Exported for unit testing.
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
 * Req 4 / SPEC "demo runs require the standard template": only the default template may be
 * demoed. Fails closed on null/undefined. Exported for unit testing.
 */
export function isStandardTemplate(isDefault: boolean | null | undefined): boolean {
  return isDefault === true
}

function splitIntoBatches<T>(rows: T[], size = INSERT_BATCH_SIZE): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size))
  return batches
}

function wordCount(text: string | null | undefined): number {
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // T-16-13: identity from the verified JWT only. Any user_id/org_id in the body is ignored.
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

    // T-16-12: super_admin asserted from the verified JWT's user_profiles row.
    // `id` (the profile PK) is what demo_runs.started_by and proposal_documents.uploaded_by
    // reference — NOT auth.users(id).
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('id, role, org_id')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'super_admin required', corsHeaders)
    }
    const callerOrgId: string = callerProfile.org_id
    const startedBy: string = callerProfile.id

    // The demo org is resolved at runtime by flag/slug, never by a hardcoded UUID.
    const { data: callerOrg } = await admin
      .from('organizations')
      .select('id, slug, feature_flags')
      .eq('id', callerOrgId)
      .single()
    if (!isDemoRunCaller(callerOrgId, orgIsDemo(callerOrg))) {
      // A super_admin outside the demo org must never materialize demo content into a
      // real client org (T-16-13).
      return jsonError(403, 'demo runs are only permitted from the demo org', corsHeaders)
    }

    const body = (await req.json().catch(() => ({}))) as { template_id?: string }

    // ---- Standard-template-only (Req 4) ------------------------------------
    let templateId: string
    if (typeof body?.template_id === 'string' && body.template_id.trim()) {
      templateId = body.template_id.trim()
      const { data: template } = await admin
        .from('templates')
        .select('id, is_default')
        .eq('id', templateId)
        .maybeSingle()
      if (!isStandardTemplate(template?.is_default as boolean | null | undefined)) {
        return jsonError(400, 'demo runs require the standard template', corsHeaders)
      }
    } else {
      const { data: defaultTemplate } = await admin
        .from('templates')
        .select('id, is_default')
        .eq('is_default', true)
        .maybeSingle()
      if (!defaultTemplate?.id || !isStandardTemplate(defaultTemplate.is_default as boolean)) {
        return jsonError(400, 'demo runs require the standard template', corsHeaders)
      }
      templateId = defaultTemplate.id as string
    }

    // ---- Active fixture ------------------------------------------------------
    // A fixture only reaches status='active' once every child row is written (16-03 writes
    // it archived, fills children, then promotes), so this can never observe a half-built one.
    const { data: fixture, error: fixtureError } = await admin
      .from('demo_fixtures')
      .select('id, template_id, version, rfp_fields, rfp_extract_text')
      .eq('template_id', templateId)
      .eq('status', 'active')
      .maybeSingle()
    if (fixtureError) return jsonError(500, fixtureError.message, corsHeaders)
    if (!fixture) {
      return jsonError(400, 'no active demo fixture for the standard template', corsHeaders)
    }

    // ---- Req 7: validate BEFORE any write -----------------------------------
    const { data: templateSections, error: tsError } = await admin
      .from('template_sections')
      .select('role, position, name, description')
      .eq('template_id', templateId)
      .order('position', { ascending: true })
    if (tsError) return jsonError(500, tsError.message, corsHeaders)

    const { data: fixtureSections, error: fsError } = await admin
      .from('demo_fixture_sections')
      .select('role, position, section_name, content, compliance_flags')
      .eq('fixture_id', fixture.id)
      .order('position', { ascending: true })
    if (fsError) return jsonError(500, fsError.message, corsHeaders)

    const validation = validateFixtureAgainstTemplate(
      templateSections ?? [],
      fixtureSections ?? []
    )
    if (!validation.ok) {
      // Nothing has been written yet — the demo simply does not start (Pitfall 4).
      return jsonError(422, validation.error, corsHeaders)
    }

    const fixtureByRole = new Map(
      (fixtureSections ?? []).map((s) => [String(s.role), s])
    )

    const { data: fixtureAssumptions, error: faError } = await admin
      .from('demo_fixture_assumptions')
      .select('category, content, confidence, status, user_edited')
      .eq('fixture_id', fixture.id)
    if (faError) return jsonError(500, faError.message, corsHeaders)

    // ---- Materialize (Req 5: every run gets its OWN proposal_id) -------------
    const rfpFields = pickRfpFields(fixture.rfp_fields)
    const { data: proposal, error: proposalError } = await admin
      .from('proposals')
      .insert({
        ...rfpFields,
        title: buildDemoTitle(rfpFields),
        org_id: callerOrgId, // server-bound, never from the body
        created_by: startedBy, // server-bound, never from the body
        status: 'draft',
        selected_template_id: templateId,
      })
      .select('id')
      .single()
    if (proposalError || !proposal) {
      return jsonError(500, `could not create demo proposal: ${proposalError?.message}`, corsHeaders)
    }
    const proposalId: string = proposal.id as string

    // Any failure past this point tears the whole run down, so a demo is never left
    // half-populated. Deleting the proposal cascades sections, assumptions, cloned chunks
    // and chats; proposal_documents.proposal_id is SET NULL (not cascade), so that row is
    // deleted explicitly (SPEC "orphan caveat"). The shared canonical Storage object is
    // referenced, not owned — it is never touched (D-06).
    let documentId: string | null = null
    const abort = async (status: number, message: string) => {
      if (documentId) await admin.from('proposal_documents').delete().eq('id', documentId)
      await admin.from('demo_runs').delete().eq('proposal_id', proposalId)
      await admin.from('proposals').delete().eq('id', proposalId)
      return jsonError(status, message, corsHeaders)
    }

    // Sections — mirrors ProposalCreationWizard's upsert shape, but pre-populated:
    // content from the fixture, status 'complete', generated_at set (no generation call).
    const generatedAt = new Date().toISOString()
    const sectionRows = (templateSections ?? []).map((ts) => {
      const fs = fixtureByRole.get(String(ts.role))
      return {
        proposal_id: proposalId,
        org_id: callerOrgId,
        name: ts.name,
        description: ts.description ?? null,
        role: ts.role ?? null,
        position: ts.position,
        section_key: `section-${ts.position}`,
        section_name: ts.name,
        content: fs?.content ?? '',
        compliance_flags: fs?.compliance_flags ?? null,
        status: 'complete',
        generated_at: generatedAt,
      }
    })
    for (const batch of splitIntoBatches(sectionRows)) {
      const { error } = await admin.from('proposal_sections').insert(batch)
      if (error) return await abort(500, `section pre-population failed: ${error.message}`)
    }

    // Assumptions — replayed already-approved so the demo starts past the review gate.
    if (fixtureAssumptions && fixtureAssumptions.length > 0) {
      const assumptionRows = fixtureAssumptions.map((a) => ({
        proposal_id: proposalId,
        org_id: callerOrgId,
        category: a.category ?? 'general', // proposal_assumptions.category is NOT NULL
        content: a.content,
        confidence: a.confidence ?? 'high',
        status: a.status ?? 'approved',
        user_edited: a.user_edited ?? false,
      }))
      for (const batch of splitIntoBatches(assumptionRows)) {
        const { error } = await admin.from('proposal_assumptions').insert(batch)
        if (error) return await abort(500, `assumption pre-population failed: ${error.message}`)
      }
    }

    // Document row (D-06) — Step2DocumentUpload polls proposal_documents and only advances
    // when every row reads parse_status='complete', so this row must exist and be complete.
    // storage_path points at the ONE shared canonical file; nothing is uploaded per run.
    const rfpText = (fixture.rfp_extract_text as string | null) ?? ''
    const { data: docRow, error: docError } = await admin
      .from('proposal_documents')
      .insert({
        proposal_id: proposalId,
        org_id: callerOrgId,
        uploaded_by: startedBy,
        name: DEMO_RFP_DOCUMENT_NAME,
        storage_path: demoRfpStoragePath(callerOrgId),
        mime_type: DEMO_RFP_MIME_TYPE,
        doc_type: 'rfp',
        parse_status: 'complete',
      })
      .select('id')
      .single()
    if (docError || !docRow) {
      return await abort(500, `demo RFP document row failed: ${docError?.message}`)
    }
    documentId = docRow.id as string

    // Extract text replayed from the fixture — never re-parsed, never re-extracted.
    const { error: extractError } = await admin.from('document_extracts').insert({
      document_id: documentId,
      org_id: callerOrgId,
      content: rfpText,
      word_count: wordCount(rfpText),
    })
    if (extractError) {
      return await abort(500, `demo RFP extract failed: ${extractError.message}`)
    }

    // Chunks — pure INSERT...SELECT of pre-computed real embeddings under the fresh
    // proposal_id (Decision C). NO embedding call. Retrieval then finds them through the
    // ordinary own-proposal branch, with zero demo-aware branching downstream (Req 6).
    const { data: clonedCount, error: cloneError } = await admin.rpc('clone_demo_fixture_chunks', {
      p_fixture_id: fixture.id,
      p_proposal_id: proposalId,
      p_org_id: callerOrgId,
    })
    if (cloneError) {
      return await abort(500, `rfp chunk clone failed: ${cloneError.message}`)
    }

    // Run tracking — drives demo-reset targeting and the abandoned-run sweep.
    const { data: runRow, error: runError } = await admin
      .from('demo_runs')
      .insert({
        proposal_id: proposalId,
        fixture_id: fixture.id,
        started_by: startedBy, // user_profiles(id), not auth.users(id)
        org_id: callerOrgId,
      })
      .select('id')
      .single()
    if (runError || !runRow) {
      return await abort(500, `demo run tracking failed: ${runError?.message}`)
    }

    return new Response(
      JSON.stringify({
        proposal_id: proposalId,
        demo_run_id: runRow.id,
        fixture_id: fixture.id,
        fixture_version: fixture.version,
        template_id: templateId,
        document_id: documentId,
        sections: sectionRows.length,
        assumptions: fixtureAssumptions?.length ?? 0,
        rfp_chunks: typeof clonedCount === 'number' ? clonedCount : 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (_error) {
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
