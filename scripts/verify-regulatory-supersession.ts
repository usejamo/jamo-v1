// scripts/verify-regulatory-supersession.ts
// Phase 14.5 acceptance test — the BRIEF's exact 4-step supersession protocol, scripted + re-runnable.
//
//   1. Ingest ICH-E6R2 (active); confirm a Phase 2 oncology US "Study Design" query retrieves it.
//   2. Ingest ICH-E6R3 with --supersedes=ICH-E6R2.
//   3. Confirm R2 -> status='superseded', superseded_by=R3; R3 -> active, supersedes=R2.
//   4. Confirm the same query now retrieves R3 and no longer retrieves R2's chunks.
//
// Uses small bundled fixture text per document (no regulatory KB PDFs are committed; this phase
// verifies WIRING, not corpus completeness). Ingest goes through the atomic ingest_regulatory_document
// RPC (same path the ported CLI uses); retrieval calls match_chunks_vector directly (same RPC as
// retrieve-context). Idempotent: deletes prior ICH-E6R2/R3 rows first.
//
// Usage: npx tsx scripts/verify-regulatory-supersession.ts
// Requires .env: VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chunkDocument } from '../src/lib/chunker.ts'
import { embedBatch } from './ingest-regulatory.ts'

const R2_KEY = 'ICH-E6R2'
const R3_KEY = 'ICH-E6R3'
const GEOGRAPHY = ['US', 'EU', 'GLOBAL']

// --- Fixture "Study Design" excerpts (distinct per revision so retrieval can distinguish them) ---
const R2_TEXT = `4. Study Design
This ICH E6(R2) guideline describes Good Clinical Practice for the design and conduct of a
Phase 2 oncology study. The study design section addresses trial objectives, endpoints, and the
protection of human subjects for oncology investigations conducted in the US and EU.
Revision R2 (2016) introduced risk-based quality management and additional guidance on essential
documents and electronic records for clinical trial safety monitoring.`

const R3_TEXT = `4. Study Design
This ICH E6(R3) guideline modernises Good Clinical Practice for the design and conduct of a
Phase 2 oncology study. The study design section emphasises a quality-by-design and proportionate
risk-based approach to trial objectives and endpoints for oncology investigations in the US and EU.
Revision R3 supersedes R2 with an updated principles-based framework and data governance guidance
for clinical trial safety monitoring.`

// --- Query construction (replicated from useProposalGeneration.buildRegulatoryQuery — pure, no LLM) ---
function buildRegulatoryQuery(opts: {
  sectionName: string
  studyPhase?: string | null
  therapeuticArea?: string | null
  indication?: string | null
}): string {
  const { sectionName, studyPhase, therapeuticArea, indication } = opts
  const lead = [studyPhase, therapeuticArea].filter((v) => v && v.trim()).join(' ').trim()
  const tail = indication && indication.trim() ? `study of ${indication.trim()}` : ''
  const descriptor = [lead, tail].filter((v) => v).join(' ').trim()
  const composed = descriptor ? `${sectionName} — ${descriptor}` : sectionName
  return composed.replace(/\s+/g, ' ').trim()
}

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (out[m[1]] === undefined || out[m[1]] === '') out[m[1]] = val
    }
  } catch { /* .env optional */ }
  return out
}

let failures = 0
function check(step: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${step}${detail ? ` :: ${detail}` : ''}`)
  if (!ok) failures++
}

// deno-lint-ignore no-explicit-any
async function ingest(supabase: any, apiKey: string, documentKey: string, text: string, supersedes: string | null) {
  const chunks = chunkDocument(text, `${documentKey}.txt`)
  const embeddings = await embedBatch(chunks.map((c) => c.content), apiKey)
  const pChunks = chunks.map((c, i) => ({
    content: c.content,
    embedding: embeddings[i],
    guideline_type: c.sectionRef ?? null,
    source: `${documentKey}.txt`,
    token_count: c.tokenCount,
  }))
  // p_supersedes_document_key is the RPC-level equivalent of the CLI's `--supersedes=<key>` flag.
  const { data, error } = await supabase.rpc('ingest_regulatory_document', {
    p_document_key: documentKey,
    p_title: `ICH ${documentKey}`,
    p_agency: 'ICH',
    p_therapeutic_area: 'Oncology',
    p_phase: ['Phase 2'],
    p_geography: GEOGRAPHY,
    p_effective_date: null,
    p_status: 'active',
    p_source: `${documentKey}.txt`,
    p_supersedes_document_key: supersedes,
    p_chunks: pChunks,
  })
  if (error) throw new Error(`ingest ${documentKey} failed: ${error.message}`)
  return data as string
}

// deno-lint-ignore no-explicit-any
async function retrieveStudyDesign(supabase: any, apiKey: string): Promise<string[]> {
  const query = buildRegulatoryQuery({
    sectionName: 'Study Design',
    studyPhase: 'Phase 2',
    therapeuticArea: 'Oncology',
    indication: 'non-small cell lung cancer',
  })
  const [queryVec] = await embedBatch([query], apiKey)
  const { data, error } = await supabase.rpc('match_chunks_vector', {
    query_embedding: queryVec,
    org_id_filter: '00000000-0000-0000-0000-000000000001',
    agencies_filter: null,
    therapeutic_areas_filter: ['Oncology'],
    phases_filter: ['Phase 2'],
    geographies_filter: ['US'],
    similarity_threshold: 0.0, // fixture-friendly: return any positive match
    match_count: 10,
  })
  if (error) throw new Error(`match_chunks_vector failed: ${error.message}`)
  return ((data ?? []) as Array<{ source: string }>).map((r) => r.source)
}

async function main() {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = env.OPENAI_API_KEY
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  if (!openaiKey) throw new Error('Missing OPENAI_API_KEY')

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // Idempotency: null the cross-refs (self-FKs) then delete both parents (CASCADE clears chunks).
  await supabase
    .from('regulatory_documents')
    .update({ supersedes: null, superseded_by: null })
    .in('document_key', [R2_KEY, R3_KEY])
  await supabase.from('regulatory_documents').delete().in('document_key', [R2_KEY, R3_KEY])
  console.log('Cleaned up any prior ICH-E6R2/R3 rows.\n')

  // Step 1: ingest R2 (active) + confirm retrieval
  const r2Id = await ingest(supabase, openaiKey, R2_KEY, R2_TEXT, null)
  const { data: r2Row } = await supabase
    .from('regulatory_documents').select('status').eq('document_key', R2_KEY).single()
  check('Step 1a: ICH-E6R2 ingested active', r2Row?.status === 'active', `status=${r2Row?.status}`)
  const sources1 = await retrieveStudyDesign(supabase, openaiKey)
  check('Step 1b: Study Design retrieves R2', sources1.some((s) => s.includes(R2_KEY)), `sources=${JSON.stringify(sources1)}`)

  // Step 2/3: ingest R3 superseding R2 + confirm status flip + FK links
  const r3Id = await ingest(supabase, openaiKey, R3_KEY, R3_TEXT, R2_KEY)
  const { data: rows } = await supabase
    .from('regulatory_documents')
    .select('document_key, status, supersedes, superseded_by')
    .in('document_key', [R2_KEY, R3_KEY])
  const r2 = (rows ?? []).find((r: { document_key: string }) => r.document_key === R2_KEY)
  const r3 = (rows ?? []).find((r: { document_key: string }) => r.document_key === R3_KEY)
  check('Step 3a: R2 -> superseded', r2?.status === 'superseded', `status=${r2?.status}`)
  check('Step 3b: R2.superseded_by = R3.id', r2?.superseded_by === r3Id, `${r2?.superseded_by} vs ${r3Id}`)
  check('Step 3c: R3 active', r3?.status === 'active', `status=${r3?.status}`)
  check('Step 3d: R3.supersedes = R2.id', r3?.supersedes === r2Id, `${r3?.supersedes} vs ${r2Id}`)

  // Step 4: retrieval now returns R3 and NOT R2
  const sources2 = await retrieveStudyDesign(supabase, openaiKey)
  check('Step 4a: Study Design now retrieves R3', sources2.some((s) => s.includes(R3_KEY)), `sources=${JSON.stringify(sources2)}`)
  check('Step 4b: R2 chunks no longer retrieved', !sources2.some((s) => s.includes(R2_KEY)), `sources=${JSON.stringify(sources2)}`)

  console.log(`\n${failures === 0 ? 'ALL STEPS PASSED ✓' : `${failures} STEP(S) FAILED ✗`}`)
  if (failures > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
