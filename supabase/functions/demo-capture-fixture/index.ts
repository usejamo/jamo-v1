// supabase/functions/demo-capture-fixture/index.ts
// Phase 16 (Plan 03) — D-04: super_admin-only, service-role fixture capture.
//
// Snapshots a LIVE proposal that was generated inside the demo org into a new,
// monotonically versioned `demo_fixtures` record plus its children:
//   - demo_fixture_sections     (content HTML verbatim, incl. data-placeholder-id spans)
//   - demo_fixture_assumptions  (category/content/confidence/status/user_edited)
//   - demo_fixture_rfp_chunks   (pre-computed real embeddings, cloned per run later)
//
// Security posture (SPEC Req 1/2, threat register T-16-08..T-16-11):
//   - Identity comes ONLY from the verified JWT (getAuthedUserAndOrg) — never the body.
//   - The caller's role is re-read from user_profiles by the verified user id; anything
//     other than 'super_admin' gets 403 (verbatim admin-create-org gate).
//   - The source proposal MUST live in the caller's own org, and that org must be the
//     demo org — capture of real-client content into a shipped fixture is impossible
//     by construction (D-05 confidentiality, T-16-09).
//   - Recapture NEVER overwrites: it inserts a new version and flips the prior active
//     row to 'archived' (Decision B — rollback is a status flip, not a redo).
//
// Section `content` is an HTML string and is copied byte-for-byte. It is never parsed,
// re-encoded, or round-tripped through any editor document model — the placeholder span
// ids live inside that HTML and must survive capture untouched (SPEC Constraints).
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Study/RFP columns on `proposals` captured into demo_fixtures.rfp_fields. */
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

/** Rows inserted per batch (chunk embeddings can be numerous). */
const INSERT_BATCH_SIZE = 100

/** Bounded retries when two captures race for the same (template_id, version). */
const VERSION_ATTEMPTS = 6

/**
 * Monotonic version allocation — the equivalent of
 * `select coalesce(max(version),0)+1 from demo_fixtures where template_id = $1`.
 * Exported for unit testing (mirrors the mapConfidence-exported-for-testing convention).
 */
export function nextVersion(maxVersion: number | null | undefined): number {
  const max = typeof maxVersion === 'number' && Number.isFinite(maxVersion) ? maxVersion : 0
  return max + 1
}

/**
 * D-05 / T-16-09 defense in depth: a proposal may only be captured when it lives in the
 * caller's own org AND that org is the demo org. Fails closed on null/undefined.
 * Exported for unit testing.
 */
export function isCapturableSource(
  sourceOrgId: string | null | undefined,
  callerOrgId: string | null | undefined,
  callerOrgIsDemo: boolean
): boolean {
  if (!sourceOrgId || !callerOrgId) return false
  if (!callerOrgIsDemo) return false
  return sourceOrgId === callerOrgId
}

/** Picks the study columns off a proposals row into the rfp_fields jsonb. Exported for testing. */
export function buildRfpFields(proposal: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const col of RFP_FIELD_COLUMNS) {
    fields[col] = proposal[col] ?? null
  }
  return fields
}

/**
 * A fixture with a blank section would render an empty section mid-demo (SPEC Req 7 —
 * never render a blank section). Capture refuses rather than baking the blank in.
 * Exported for unit testing.
 */
export function findBlankSections(
  sections: Array<{ section_name?: string | null; name?: string | null; position?: number | null; content?: string | null }>
): string[] {
  return sections
    .filter((s) => !s.content || s.content.trim() === '')
    .map((s) => s.section_name ?? s.name ?? `position ${s.position ?? '?'}`)
}

function splitIntoBatches<T>(rows: T[], size = INSERT_BATCH_SIZE): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size))
  return batches
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // T-16-10: identity from the verified JWT only. Any user_id/org_id in the body is ignored.
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

    // T-16-08: super_admin asserted from the verified JWT's user_profiles row, never
    // implied by merely reaching this endpoint. `id` is the profile PK used by
    // demo_fixtures.captured_by (which FKs user_profiles(id), not auth.users(id)).
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('id, role, org_id')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'super_admin required', corsHeaders)
    }
    const callerOrgId: string = callerProfile.org_id
    const capturedBy: string = callerProfile.id

    const body = (await req.json().catch(() => ({}))) as { source_proposal_id?: string; label?: string }
    const sourceProposalId = body?.source_proposal_id
    if (!sourceProposalId || typeof sourceProposalId !== 'string') {
      return jsonError(400, 'source_proposal_id is required', corsHeaders)
    }

    // The demo org is resolved at runtime by flag, never by a hardcoded UUID.
    const { data: callerOrg } = await admin
      .from('organizations')
      .select('id, slug, feature_flags')
      .eq('id', callerOrgId)
      .single()
    // Flag OR slug, matching demo-run-start, demo-reset, src/lib/demoOrg.ts and the sweep
    // migration (16-REVIEW WR-04). Flag-only resolution here meant a demo org identified by
    // slug alone would 403 on capture while both destructive endpoints accepted it — the
    // inconsistency fails closed, but only capture was inconsistent.
    const callerFlags = (callerOrg?.feature_flags ?? null) as Record<string, unknown> | null
    const callerOrgIsDemo =
      callerFlags?.is_demo === true ||
      callerFlags?.is_demo === 'true' ||
      callerOrg?.slug === 'jamo-demo'

    const { data: proposal, error: proposalError } = await admin
      .from('proposals')
      .select(
        'id, org_id, status, selected_template_id, ' + RFP_FIELD_COLUMNS.join(', ')
      )
      .eq('id', sourceProposalId)
      .maybeSingle()
    if (proposalError) return jsonError(500, proposalError.message, corsHeaders)
    if (!proposal) {
      // Do not distinguish "missing" from "other org" any further than this.
      return jsonError(403, 'capture only permitted for demo-org proposals', corsHeaders)
    }

    // T-16-09 / D-05: never snapshot content from outside the demo org.
    if (!isCapturableSource(proposal.org_id as string, callerOrgId, callerOrgIsDemo)) {
      return jsonError(403, 'capture only permitted for demo-org proposals', corsHeaders)
    }

    const templateId = proposal.selected_template_id as string | null
    if (!templateId) {
      return jsonError(400, 'source proposal has no selected_template_id', corsHeaders)
    }

    // ---- Gather every source row before writing anything -------------------
    const { data: sections, error: sectionsError } = await admin
      .from('proposal_sections')
      .select('role, position, name, content, compliance_flags')
      .eq('proposal_id', sourceProposalId)
      .order('position', { ascending: true })
    if (sectionsError) return jsonError(500, sectionsError.message, corsHeaders)
    if (!sections || sections.length === 0) {
      return jsonError(400, 'source proposal has no sections to capture', corsHeaders)
    }
    const blank = findBlankSections(sections)
    if (blank.length > 0) {
      return jsonError(
        400,
        `source proposal has ungenerated section(s): ${blank.join(', ')}`,
        corsHeaders
      )
    }

    const { data: assumptions, error: assumptionsError } = await admin
      .from('proposal_assumptions')
      .select('category, content, confidence, status, user_edited')
      .eq('proposal_id', sourceProposalId)
    if (assumptionsError) return jsonError(500, assumptionsError.message, corsHeaders)

    // Raw RFP text: proposal_documents -> document_extracts.content (rfp doc preferred).
    const { data: docs } = await admin
      .from('proposal_documents')
      .select('id, doc_type, created_at')
      .eq('proposal_id', sourceProposalId)
      .order('created_at', { ascending: true })
    let rfpExtractText: string | null = null
    if (docs && docs.length > 0) {
      const ordered = [...docs].sort(
        (a, b) => (a.doc_type === 'rfp' ? 0 : 1) - (b.doc_type === 'rfp' ? 0 : 1)
      )
      const { data: extracts } = await admin
        .from('document_extracts')
        .select('document_id, content')
        .in('document_id', ordered.map((d) => d.id))
      if (extracts && extracts.length > 0) {
        for (const doc of ordered) {
          const hit = extracts.find((e) => e.document_id === doc.id && e.content)
          if (hit) {
            rfpExtractText = hit.content
            break
          }
        }
      }
    }

    // Pre-computed real embeddings. `embedding` is returned as its pgvector text form and
    // is written back unchanged — dimensionality and metadata shape are preserved (Decision C).
    const { data: sourceChunks, error: chunksError } = await admin
      .from('chunks')
      .select('source, content, embedding, metadata')
      .eq('doc_type', 'proposal')
      .eq('proposal_id', sourceProposalId)
    if (chunksError) return jsonError(500, chunksError.message, corsHeaders)

    // ---- Write: insert the new version as 'archived', fill children, then flip -----
    // Inserting archived first keeps the partial unique index (one active per template)
    // satisfied at every instant AND guarantees the demo is never left with zero active
    // fixtures if a child insert fails partway. The prior active row is archived only
    // once the new version is complete; the flip to 'active' is the last write.
    let fixtureId: string | null = null
    let version = 0
    let lastInsertError: string | null = null

    for (let attempt = 0; attempt < VERSION_ATTEMPTS; attempt++) {
      const { data: latest } = await admin
        .from('demo_fixtures')
        .select('version')
        .eq('template_id', templateId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      version = nextVersion(latest?.version as number | null)

      const { data: inserted, error: insertError } = await admin
        .from('demo_fixtures')
        .insert({
          template_id: templateId,
          version,
          label: typeof body?.label === 'string' && body.label.trim() ? body.label.trim() : null,
          status: 'archived',
          source_proposal_id: sourceProposalId,
          rfp_fields: buildRfpFields(proposal as Record<string, unknown>),
          rfp_extract_text: rfpExtractText,
          org_id: callerOrgId,
          captured_by: capturedBy,
        })
        .select('id')
        .single()
      if (!insertError && inserted) {
        fixtureId = inserted.id as string
        break
      }
      lastInsertError = insertError?.message ?? 'unknown insert error'
      if (insertError?.code !== '23505') {
        return jsonError(500, lastInsertError, corsHeaders)
      }
      // else: a concurrent capture took this version — recompute and retry.
    }

    if (!fixtureId) {
      return jsonError(409, `could not allocate a fixture version: ${lastInsertError}`, corsHeaders)
    }

    // Any failure past this point removes the half-built fixture (children cascade) so a
    // partial version is never left behind and the prior active fixture stays active.
    const abort = async (status: number, message: string) => {
      await admin.from('demo_fixtures').delete().eq('id', fixtureId)
      return jsonError(status, message, corsHeaders)
    }

    // Sections — `content` copied verbatim; the data-placeholder-id spans ride along inside it.
    const sectionRows = sections.map((s) => ({
      fixture_id: fixtureId,
      role: s.role,
      position: s.position,
      section_name: s.name,
      content: s.content,
      compliance_flags: s.compliance_flags ?? null,
    }))
    for (const batch of splitIntoBatches(sectionRows)) {
      const { error } = await admin.from('demo_fixture_sections').insert(batch)
      if (error) return await abort(500, `section capture failed: ${error.message}`)
    }

    if (assumptions && assumptions.length > 0) {
      const assumptionRows = assumptions.map((a) => ({
        fixture_id: fixtureId,
        category: a.category ?? null,
        content: a.content,
        confidence: a.confidence ?? null,
        status: a.status ?? 'approved',
        user_edited: a.user_edited ?? false,
      }))
      for (const batch of splitIntoBatches(assumptionRows)) {
        const { error } = await admin.from('demo_fixture_assumptions').insert(batch)
        if (error) return await abort(500, `assumption capture failed: ${error.message}`)
      }
    }

    if (sourceChunks && sourceChunks.length > 0) {
      const chunkRows = sourceChunks.map((c) => ({
        fixture_id: fixtureId,
        source: c.source ?? null,
        content: c.content,
        embedding: c.embedding,
        metadata: c.metadata ?? null,
      }))
      for (const batch of splitIntoBatches(chunkRows)) {
        const { error } = await admin.from('demo_fixture_rfp_chunks').insert(batch)
        if (error) return await abort(500, `rfp chunk capture failed: ${error.message}`)
      }
    }

    // Decision B: archive the prior active version, then promote this one. Prior versions
    // are retained and reactivatable by a status flip — recapture never overwrites.
    //
    // The prior active id is read BEFORE the archive so the promote step can undo it. Without
    // that, an archive-succeeds/activate-fails interleaving would archive the old fixture, then
    // delete the new one, leaving the template with ZERO active fixtures — breaking the
    // never-zero-active invariant this ordering exists to uphold.
    const { data: priorActive } = await admin
      .from('demo_fixtures')
      .select('id')
      .eq('template_id', templateId)
      .eq('status', 'active')
      .neq('id', fixtureId)
      .maybeSingle()

    const { error: archiveError } = await admin
      .from('demo_fixtures')
      .update({ status: 'archived' })
      .eq('template_id', templateId)
      .eq('status', 'active')
      .neq('id', fixtureId)
    if (archiveError) return await abort(500, `could not archive prior fixture: ${archiveError.message}`)

    const { error: activateError } = await admin
      .from('demo_fixtures')
      .update({ status: 'active' })
      .eq('id', fixtureId)
    if (activateError) {
      // Restore the prior active version first — this row is still 'archived', so the partial
      // unique index (one active per template) permits the restore before the delete.
      if (priorActive?.id) {
        await admin.from('demo_fixtures').update({ status: 'active' }).eq('id', priorActive.id)
      }
      return await abort(500, `could not activate fixture: ${activateError.message}`)
    }

    return new Response(
      JSON.stringify({
        fixture_id: fixtureId,
        version,
        template_id: templateId,
        sections: sectionRows.length,
        assumptions: assumptions?.length ?? 0,
        rfp_chunks: sourceChunks?.length ?? 0,
        rfp_extract_text_captured: rfpExtractText !== null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (_error) {
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
