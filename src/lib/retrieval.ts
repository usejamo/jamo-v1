// src/lib/retrieval.ts
// Hybrid search merge and system prompt block assembly
// These are pure functions — no Supabase dependency — easily testable

export const RETRIEVAL_K_REGULATORY = 5
export const RETRIEVAL_K_PROPOSALS = 5
export const RETRIEVAL_SIMILARITY_THRESHOLD = 0.65

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

export function mergeHybridResults(
  vectorResults: VectorResult[],
  textResults: TextResult[],
  k: number
): MergedResult[] {
  // Map-based dedup: preserve both scores per ID for weighted scoring
  const scores = new Map<string, {
    content: string
    source: string
    agency?: string
    therapeutic_area?: string
    doc_type: string
    vector: number
    text: number
  }>()

  for (const r of vectorResults) {
    scores.set(r.id, {
      content: r.content,
      source: r.source,
      agency: r.agency,
      therapeutic_area: r.therapeutic_area,
      doc_type: r.doc_type,
      vector: r.vector_score,
      text: 0,
    })
  }

  for (const r of textResults) {
    const existing = scores.get(r.id)
    if (existing) {
      existing.text = r.text_score
    } else {
      scores.set(r.id, {
        content: r.content,
        source: r.source,
        agency: r.agency,
        therapeutic_area: r.therapeutic_area,
        doc_type: r.doc_type,
        vector: 0,
        text: r.text_score,
      })
    }
  }

  return Array.from(scores.entries())
    .map(([id, s]) => ({
      id,
      content: s.content,
      source: s.source,
      agency: s.agency,
      therapeutic_area: s.therapeutic_area,
      doc_type: s.doc_type,
      final_score: 0.7 * s.vector + 0.3 * s.text,
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
