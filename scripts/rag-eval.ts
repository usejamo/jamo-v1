// scripts/rag-eval.ts
// RAG retrieval evaluation harness — step 4 of the retrieval remediation plan.
//
// Measures retrieval quality against a golden set of (question, expected_chunk_ids)
// pairs. This is the instrument that has to exist BEFORE a reranker (step 5) or
// contextual retrieval (step 6): both are judged by whether they move these numbers,
// and neither can be tuned by eyeballing single queries.
//
// Deliberately measures the RETRIEVAL layer (the two RPCs plus the fusion), not the
// edge function end-to-end, so a regression can be attributed to a specific arm.
//
// Usage:
//   npx tsx scripts/rag-eval.ts                        # run against the golden set
//   npx tsx scripts/rag-eval.ts --sweep                # threshold sweep per corpus
//   npx tsx scripts/rag-eval.ts --set <path>           # alternative golden set file
//   npx tsx scripts/rag-eval.ts --verbose              # per-question detail
//
// Golden set format (JSON array):
//   [{ "id": "q1",
//      "question": "What is the planned enrollment?",
//      "corpus": "proposal" | "regulatory",
//      "orgId": "...", "proposalId": "...",          // proposalId for corpus=proposal
//      "expectedChunkIds": ["uuid", ...],            // [] means UNANSWERABLE (abstention case)
//      "style": "conversational" | "keyword",
//      "provenance": "real_transcript" | "synthetic_from_document" }]
//
// PROVENANCE MATTERS. Questions mined from real transcripts measure what users
// actually ask. Questions synthesised from documents measure what the corpus can
// answer, which is easier and flatters the system: the question is written while
// looking at the answer, so it inherits the document's vocabulary and dodges the
// vocabulary-mismatch problem that is the whole difficulty in practice. Keep the two
// provenances separate in any report — a recall number over a synthetic-only set is
// an upper bound, not an estimate.

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

config()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OPENAI_KEY = process.env.OPENAI_API_KEY!

// Mirrors supabase/functions/retrieve-context/index.ts. Kept as a local constant so a
// sweep can vary it without touching production.
const RRF_K = 60
const DEFAULT_FLOOR = 0.2
const K_CANDIDATES = [5, 10, 20]

interface GoldenItem {
  id: string
  question: string
  corpus: 'proposal' | 'regulatory'
  orgId: string
  proposalId?: string
  expectedChunkIds: string[]
  style?: 'conversational' | 'keyword'
  provenance?: string
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  })
  return r.data[0].embedding
}

/** Reciprocal Rank Fusion — must stay identical to the edge function's merge. */
function rrf(vectorIds: string[], textIds: string[]): string[] {
  const scores = new Map<string, number>()
  const arm = (ids: string[]) =>
    ids.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1)))
  arm(vectorIds)
  arm(textIds)
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}

/** Run both arms and return the fused ranking, longest-first so recall@k can slice it. */
async function retrieve(item: GoldenItem, floor: number, limit: number): Promise<string[]> {
  const queryVector = await embed(item.question)

  if (item.corpus === 'proposal') {
    const [{ data: vec }, { data: fts }] = await Promise.all([
      supabase.rpc('match_chunks_vector_proposals', {
        query_embedding: queryVector as unknown as string,
        org_id_filter: item.orgId,
        similarity_threshold: floor,
        match_count: limit,
        current_proposal_id: item.proposalId ?? null,
      }),
      supabase.rpc('match_chunks_fts_proposals', {
        query_text: item.question,
        org_id_filter: item.orgId,
        match_count: limit,
        current_proposal_id: item.proposalId ?? null,
      }),
    ])
    return rrf((vec ?? []).map((r: any) => r.id), (fts ?? []).map((r: any) => r.id))
  }

  const [{ data: vec }, { data: fts }] = await Promise.all([
    supabase.rpc('match_chunks_vector', {
      query_embedding: queryVector as unknown as string,
      org_id_filter: item.orgId,
      agencies_filter: null,
      therapeutic_areas_filter: null,
      phases_filter: null,
      geographies_filter: null,
      similarity_threshold: floor,
      match_count: limit,
    }),
    supabase.rpc('match_chunks_fts', {
      query_text: item.question,
      org_id_filter: item.orgId,
      agencies_filter: null,
      therapeutic_areas_filter: null,
      phases_filter: null,
      geographies_filter: null,
      match_count: limit,
    }),
  ])
  return rrf((vec ?? []).map((r: any) => r.id), (fts ?? []).map((r: any) => r.id))
}

interface Result {
  item: GoldenItem
  ranked: string[]
  hitRank: number | null   // 1-based rank of the first expected chunk; null if absent
}

function evaluate(results: Result[]) {
  const answerable = results.filter(r => r.item.expectedChunkIds.length > 0)
  const unanswerable = results.filter(r => r.item.expectedChunkIds.length === 0)

  const recallAt = (k: number) =>
    answerable.length === 0
      ? 0
      : answerable.filter(r => r.hitRank !== null && r.hitRank <= k).length / answerable.length

  // For unanswerable questions the system should retrieve nothing. Retrieval cannot
  // truly abstain (that is the reranker's job in step 5) so this is reported as
  // "returned anything at all", a proxy to watch rather than a pass/fail.
  const noiseRate =
    unanswerable.length === 0
      ? null
      : unanswerable.filter(r => r.ranked.length > 0).length / unanswerable.length

  return { answerable: answerable.length, unanswerable: unanswerable.length, recallAt, noiseRate }
}

function report(results: Result[], label: string) {
  const m = evaluate(results)
  console.log(`\n=== ${label} ===`)
  console.log(`answerable: ${m.answerable}   unanswerable: ${m.unanswerable}`)
  for (const k of K_CANDIDATES) {
    console.log(`  recall@${String(k).padEnd(3)} ${(m.recallAt(k) * 100).toFixed(1)}%`)
  }
  if (m.noiseRate !== null) {
    console.log(`  unanswerable returning >0 chunks: ${(m.noiseRate * 100).toFixed(1)}%`)
  }
  const missed = results.filter(r => r.item.expectedChunkIds.length > 0 && r.hitRank === null)
  if (missed.length) {
    console.log(`\n  MISSED ENTIRELY (${missed.length}):`)
    missed.forEach(r => console.log(`    [${r.item.style ?? '?'}] ${r.item.question.slice(0, 76)}`))
  }
}

function breakdown(results: Result[], key: 'style' | 'provenance' | 'corpus') {
  const groups = new Map<string, Result[]>()
  results.forEach(r => {
    const g = String(r.item[key] ?? 'unspecified')
    groups.set(g, [...(groups.get(g) ?? []), r])
  })
  if (groups.size > 1) {
    for (const [g, rs] of groups) report(rs, `${key} = ${g}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const setPath = args.includes('--set')
    ? args[args.indexOf('--set') + 1]
    : 'docs/rag-eval/golden-set.json'
  const verbose = args.includes('--verbose')
  const sweep = args.includes('--sweep')

  let golden: GoldenItem[]
  try {
    golden = JSON.parse(readFileSync(resolve(process.cwd(), setPath), 'utf8'))
  } catch (e) {
    console.error(`Could not read golden set at ${setPath}`)
    console.error('Build one first — see docs/rag-eval/README.md')
    process.exit(1)
  }
  console.log(`golden set: ${setPath}  (${golden.length} items)`)

  const maxK = Math.max(...K_CANDIDATES)
  const results: Result[] = []
  for (const item of golden) {
    const ranked = await retrieve(item, DEFAULT_FLOOR, maxK)
    const idx = ranked.findIndex(id => item.expectedChunkIds.includes(id))
    results.push({ item, ranked, hitRank: idx === -1 ? null : idx + 1 })
    if (verbose) {
      const mark = idx === -1 ? 'MISS' : `@${idx + 1}`
      console.log(`  [${mark.padEnd(5)}] ${item.question.slice(0, 70)}`)
    }
  }

  report(results, 'OVERALL')
  breakdown(results, 'corpus')
  breakdown(results, 'style')
  breakdown(results, 'provenance')

  if (sweep) {
    console.log('\n=== threshold sweep (recall@10) ===')
    console.log('floor   proposal   regulatory')
    for (const floor of [0.0, 0.1, 0.2, 0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]) {
      const row: Record<string, string> = {}
      for (const corpus of ['proposal', 'regulatory'] as const) {
        const subset = golden.filter(g => g.corpus === corpus && g.expectedChunkIds.length > 0)
        if (!subset.length) { row[corpus] = '   -  '; continue }
        let hits = 0
        for (const item of subset) {
          const ranked = await retrieve(item, floor, 10)
          if (ranked.slice(0, 10).some(id => item.expectedChunkIds.includes(id))) hits++
        }
        row[corpus] = `${((hits / subset.length) * 100).toFixed(1)}%`.padStart(6)
      }
      console.log(`${floor.toFixed(2)}   ${row.proposal}     ${row.regulatory}`)
    }
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
