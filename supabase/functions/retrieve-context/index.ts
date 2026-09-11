import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { isInternalServiceRoleCall, getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

// ============================================================================
// NAMED CONSTANTS — must be at module top (locked requirement)
// ============================================================================

const RETRIEVAL_K_REGULATORY = 10
const RETRIEVAL_K_PROPOSALS = 10

// Cosine floors — SANITY GUARDS, NOT RELEVANCE DECISIONS.
//
// The previous single 0.65 floor rejected every real hit. Measured against 14
// production chunks for "What is the planned enrollment for this trial?":
//
//   relevant chunks   0.445 .. 0.539
//   irrelevant chunks 0.323 .. 0.571   <- spans straight through the relevant band
//
// The bands OVERLAP, so no cosine floor can separate relevant from irrelevant:
// any cutoff admitting the 0.445 real hit also admits 0.507 noise. 0.65 simply
// rejected 100% of them, which is why chat reported that facts sitting in the
// corpus "have not been provided".
//
// These values are therefore deliberately low: they exist only to drop the far
// tail, not to decide relevance. Precision is NOT restored here — it belongs to
// a cross-encoder reranker over the fused candidate set, whose scores are
// actually calibrated to relevance, and that is where the regulatory abstention
// threshold should live. Do not "tune" these to 0.45-0.50 and call it
// precision: that admits the noise and still excludes real hits.
const RETRIEVAL_SIMILARITY_THRESHOLD_PROPOSALS = 0.2
const RETRIEVAL_SIMILARITY_THRESHOLD_REGULATORY = 0.2

// ============================================================================
// TYPES
// ============================================================================

interface RetrieveRequest {
  orgId: string
  query: string
  therapeuticArea?: string
  studyPhase?: string       // NEW (14.5) — regulatory phase pre-filter
  geography?: string[]      // NEW (14.5) — regulatory geography pre-filter (GLOBAL always matches)
  proposalId?: string       // NEW (14.7) — proposal-history scoping
  k_regulatory?: number   // optional — falls back to RETRIEVAL_K_REGULATORY
  k_proposal?: number     // optional — falls back to RETRIEVAL_K_PROPOSALS
}

interface Chunk {
  id: string
  content: string
  source: string
  agency?: string
  therapeutic_area?: string
  doc_type: string
  final_score: number
}

interface RetrieveResponse {
  regulatoryChunks: Chunk[]
  proposalChunks: Chunk[]
  systemPromptBlock: string
  retrievalMeta: {
    regulatoryCount: number
    proposalCount: number
    belowThreshold: boolean
    regulatoryRelaxationLevel: number   // 0=full filters, 1=phase dropped, 2=phase+TA dropped
  }
}

// ============================================================================
// HYBRID MERGE UTILITIES (inlined for Edge Function — no cross-function imports)
// ============================================================================

interface VectorResult {
  id: string
  content: string
  source: string
  agency?: string
  therapeutic_area?: string
  doc_type: string
  vector_score: number
}

interface TextResult {
  id: string
  content: string
  source: string
  agency?: string
  therapeutic_area?: string
  doc_type: string
  text_score: number
}

// Reciprocal Rank Fusion.
//
// The previous merge was `0.7 * vector_score + 0.3 * text_score`, which looked
// like a 70/30 blend but was not one. Cosine similarity lands around 0.4-0.7
// while ts_rank lands around 0.01-0.1, so the text arm contributed roughly 2%
// of the final score — the blend was vector-only in practice, and a strong
// keyword hit could not surface a chunk the vector arm had missed.
//
// RRF fuses by RANK POSITION rather than score, so arms on wildly different
// scales become comparable without hand-tuned weights:
//
//     score(doc) = SUM over arms of 1 / (RRF_K + rank_in_that_arm)
//
// Each arm arrives already sorted by its own score, so index order is rank.
// A document found by both arms outranks one found by a single arm even when
// the single arm liked it more, which is the behaviour we want: agreement
// between independent retrievers is the strongest signal available here.
//
// RRF_K = 60 is the standard damping constant from the original RRF paper; it
// flattens the difference between top ranks so rank 1 does not dominate rank 2
// outright. Arms are equally weighted to start.
//
// NOTE: this is NOT a relevance gate. RRF scores are relative positions within
// one query's candidate set and are not comparable across queries — do not
// threshold on them. Precision belongs to a downstream reranker.
export const RRF_K = 60

export function mergeHybridResults(
  vectorResults: VectorResult[],
  textResults: TextResult[],
  k: number
): Chunk[] {
  const fused = new Map<string, {
    content: string
    source: string
    agency?: string
    therapeutic_area?: string
    doc_type: string
    score: number
  }>()

  const addArm = (
    results: Array<VectorResult | TextResult>
  ) => {
    results.forEach((r, index) => {
      const rank = index + 1
      const contribution = 1 / (RRF_K + rank)
      const existing = fused.get(r.id)
      if (existing) {
        existing.score += contribution
      } else {
        fused.set(r.id, {
          content: r.content,
          source: r.source,
          agency: r.agency,
          therapeutic_area: r.therapeutic_area,
          doc_type: r.doc_type,
          score: contribution,
        })
      }
    })
  }

  addArm(vectorResults)
  addArm(textResults)

  return Array.from(fused.entries())
    .map(([id, s]) => ({
      id,
      content: s.content,
      source: s.source,
      agency: s.agency,
      therapeutic_area: s.therapeutic_area,
      doc_type: s.doc_type,
      final_score: s.score,
    }))
    .sort((a, b) => b.final_score - a.final_score)
    .slice(0, k)
}

export function buildSystemPromptBlock(
  regulatoryChunks: Chunk[],
  proposalChunks: Chunk[]
): string {
  const regSection =
    regulatoryChunks.length > 0
      ? regulatoryChunks.map(c => `[${c.source}] ${c.content}`).join('\n\n')
      : '(No relevant regulatory context found)'

  const propSection =
    proposalChunks.length > 0
      ? proposalChunks.map(c => `[${c.source}] ${c.content}`).join('\n\n')
      : '(No relevant proposal history found)'

  return `[REGULATORY CONTEXT]\n${regSection}\n\n[PROPOSAL HISTORY]\n${propSection}\n\n[INSTRUCTIONS]\nAnswer strictly from the above context. When citing, distinguish between regulatory sources and proposal history.`
}

// ============================================================================
// EDGE FUNCTION REQUEST HANDLER
// ============================================================================

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Parse request
    const { orgId, query, therapeuticArea, studyPhase, geography, proposalId, k_regulatory, k_proposal } = await req.json() as RetrieveRequest

    // Resolve effective K values — cap at 20 to prevent DoS via unbounded pgvector queries (T-14.1-04)
    const effectiveKRegulatory = Math.min(k_regulatory ?? RETRIEVAL_K_REGULATORY, 20)
    const effectiveKProposals = Math.min(k_proposal ?? RETRIEVAL_K_PROPOSALS, 20)

    if (!orgId || !query) {
      return new Response(JSON.stringify({ error: 'orgId and query are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1b. Branch on caller shape (REQ-2, D-03, T-14.3-09/10/11):
    //   - INTERNAL (chat-with-jamo/rag.ts): service-role bearer, no end-user JWT —
    //     trust body orgId as-is. Behavior UNCHANGED. Must NOT call getAuthedUserAndOrg
    //     here (Pitfall 1) or the service-role caller (which has no end-user) will 401
    //     and RAG will silently return empty (rag.ts swallows the error).
    //   - USER call (useProposalGeneration.ts): derive+validate org from the JWT; a
    //     mismatched body orgId is rejected loudly rather than trusted.
    let effectiveOrgId: string
    if (isInternalServiceRoleCall(req)) {
      effectiveOrgId = orgId
    } else {
      let jwtOrgId: string
      try {
        ;({ orgId: jwtOrgId } = await getAuthedUserAndOrg(req, corsHeaders))
      } catch (e) {
        if (e instanceof Response) return e
        throw e
      }
      if (orgId && orgId !== jwtOrgId) return jsonError(403, 'org mismatch', corsHeaders)
      effectiveOrgId = jwtOrgId
    }

    // 2. Create clients
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY')!,
    })

    // 3. Embed the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    })
    const queryVector = embeddingResponse.data[0].embedding

    // 4. Resolve filters — agencies column doesn't exist on organizations, pass null to skip filter.
    // Pass null (not []) when an attribute is absent so the RPC's `filter IS NULL OR ...` skips it;
    // an empty array would make `= ANY('{}')` always false and wrongly exclude every row.
    const agencies: string[] | null = null
    const baseTherapeuticAreas: string[] | null = therapeuticArea ? [therapeuticArea] : null
    const phasesFilter: string[] | null = studyPhase ? [studyPhase] : null
    const geographiesFilter: string[] | null = geography && geography.length ? geography : null

    // 5-6. Regulatory hybrid search with GRADED FILTER RELAXATION.
    // Tighten first (phase + TA); if the merged regulatory result is under the per-doc_type budget,
    // relax one dimension at a time: drop phases_filter, then drop therapeutic_areas_filter.
    // ALWAYS keep geographies_filter; status='active' is enforced inside the RPC. (inlined — Deno)
    const relaxationLevels: Array<{ level: number; ta: string[] | null; phases: string[] | null }> = [
      { level: 0, ta: baseTherapeuticAreas, phases: phasesFilter }, // full tight filter set
      { level: 1, ta: baseTherapeuticAreas, phases: null },         // drop phase
      { level: 2, ta: null, phases: null },                         // drop TA too
    ]

    let regulatoryChunks: Chunk[] = []
    let relaxationLevelUsed = 0
    for (const lvl of relaxationLevels) {
      const { data: regVectorRows, error: regVecErr } = await supabase.rpc('match_chunks_vector', {
        query_embedding: queryVector,
        org_id_filter: effectiveOrgId,
        agencies_filter: agencies,
        therapeutic_areas_filter: lvl.ta,
        phases_filter: lvl.phases,
        geographies_filter: geographiesFilter,
        similarity_threshold: RETRIEVAL_SIMILARITY_THRESHOLD_REGULATORY,
        match_count: effectiveKRegulatory * 2,
      })
      if (regVecErr) {
        console.warn(`[retrieve-context] Vector search (regulatory, relax=${lvl.level}) error: ${regVecErr.message}`)
      }

      const { data: regFtsRows, error: regFtsErr } = await supabase.rpc('match_chunks_fts', {
        query_text: query,
        org_id_filter: effectiveOrgId,
        agencies_filter: agencies,
        therapeutic_areas_filter: lvl.ta,
        phases_filter: lvl.phases,
        geographies_filter: geographiesFilter,
        match_count: effectiveKRegulatory * 2,
      })
      if (regFtsErr) {
        console.warn(`[retrieve-context] FTS search (regulatory, relax=${lvl.level}) error: ${regFtsErr.message}`)
      }

      regulatoryChunks = mergeHybridResults(
        (regVectorRows ?? []) as VectorResult[],
        (regFtsRows ?? []) as TextResult[],
        effectiveKRegulatory
      )
      relaxationLevelUsed = lvl.level
      if (regulatoryChunks.length >= effectiveKRegulatory) break
    }
    console.log(
      `[retrieve-context] regulatory relaxation level used: ${relaxationLevelUsed}, count=${regulatoryChunks.length}`
    )

    // 7. Vector search — proposal chunks (no agency/therapeutic_area filter — org RLS handles isolation)
    const { data: propVectorRows, error: propVecErr } = await supabase.rpc('match_chunks_vector_proposals', {
      query_embedding: queryVector,
      org_id_filter: effectiveOrgId,
      similarity_threshold: RETRIEVAL_SIMILARITY_THRESHOLD_PROPOSALS,
      match_count: effectiveKProposals * 2,
      current_proposal_id: proposalId ?? null,
    })

    if (propVecErr) {
      console.warn(`[retrieve-context] Vector search (proposals) error: ${propVecErr.message}`)
    }

    // 8. FTS search — proposal chunks
    const { data: propFtsRows, error: propFtsErr } = await supabase.rpc('match_chunks_fts_proposals', {
      query_text: query,
      org_id_filter: effectiveOrgId,
      match_count: effectiveKProposals * 2,
      current_proposal_id: proposalId ?? null,
    })

    if (propFtsErr) {
      console.warn(`[retrieve-context] FTS search (proposals) error: ${propFtsErr.message}`)
    }

    // 9. Merge hybrid results (regulatory already merged per relaxation level above)
    const proposalChunks = mergeHybridResults(
      (propVectorRows ?? []) as VectorResult[],
      (propFtsRows ?? []) as TextResult[],
      effectiveKProposals
    )

    // 10. Log warning if below minimum chunk count
    if (regulatoryChunks.length < 1 || proposalChunks.length < 1) {
      console.warn(
        `[retrieve-context] Below minimum chunk count: regulatory=${regulatoryChunks.length}, proposal=${proposalChunks.length}`
      )
    }

    // 11. Build system prompt block
    const systemPromptBlock = buildSystemPromptBlock(regulatoryChunks, proposalChunks)

    // 12. Return response
    const response: RetrieveResponse = {
      regulatoryChunks,
      proposalChunks,
      systemPromptBlock,
      retrievalMeta: {
        regulatoryCount: regulatoryChunks.length,
        proposalCount: proposalChunks.length,
        belowThreshold: regulatoryChunks.length < 1 || proposalChunks.length < 1,
        regulatoryRelaxationLevel: relaxationLevelUsed,
      },
    }

    // Retrieval telemetry — feeds the golden-set work that has to precede any
    // reranker or further tuning. One structured line per call so scores can be
    // pulled out of the function logs and turned into a distribution. Logs the
    // query TEXT (needed to build realistic (question, expected_chunk) pairs
    // from genuine usage) but never chunk content.
    console.log(JSON.stringify({
      tag: 'retrieval_telemetry',
      orgId: effectiveOrgId,
      proposalId: proposalId ?? null,
      query,
      queryLength: query.length,
      kRegulatory: effectiveKRegulatory,
      kProposals: effectiveKProposals,
      regulatoryRelaxationLevel: relaxationLevelUsed,
      regulatoryCount: regulatoryChunks.length,
      proposalCount: proposalChunks.length,
      // RRF scores — positional, only comparable within this one call.
      topRegulatory: regulatoryChunks.slice(0, 10).map(c => ({ id: c.id, score: Number(c.final_score.toFixed(5)), source: c.source })),
      topProposal: proposalChunks.slice(0, 10).map(c => ({ id: c.id, score: Number(c.final_score.toFixed(5)), source: c.source })),
    }))

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[retrieve-context] Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
