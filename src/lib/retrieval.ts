// src/lib/retrieval.ts
// Hybrid search merge and system prompt block assembly
// These are pure functions — no Supabase dependency — easily testable

// Mirrors of the values in supabase/functions/retrieve-context/index.ts, which
// is where retrieval actually runs. Nothing imports these today; they are kept
// only so this module reads as a faithful copy of the edge function's logic.
// If you change one side, change the other.
//
// The cosine floors are SANITY GUARDS, NOT relevance decisions — measured
// relevant and irrelevant chunks occupy overlapping score bands, so no floor
// can separate them. See the edge function for the measurements.
export const RETRIEVAL_K_REGULATORY = 10
export const RETRIEVAL_K_PROPOSALS = 10
export const RETRIEVAL_SIMILARITY_THRESHOLD_REGULATORY = 0.2
export const RETRIEVAL_SIMILARITY_THRESHOLD_PROPOSALS = 0.2

export interface VectorResult {
  id: string
  content: string
  source: string
  agency?: string
  therapeutic_area?: string
  doc_type: string
  vector_score: number
}

export interface TextResult {
  id: string
  content: string
  source: string
  agency?: string
  therapeutic_area?: string
  doc_type: string
  text_score: number
}

export interface MergedResult {
  id: string
  content: string
  source: string
  agency?: string
  therapeutic_area?: string
  doc_type: string
  final_score: number
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
): MergedResult[] {
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
  regulatoryChunks: MergedResult[],
  proposalChunks: MergedResult[]
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
