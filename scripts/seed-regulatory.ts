// scripts/seed-regulatory.ts
// Manifest-driven starter-corpus seeder (Approach A: manifest + folder convention).
//
// Reuses the ported ingest path from scripts/ingest-regulatory.ts (embedBatch, chunkDocument, the
// ingest_regulatory_document RPC) — does NOT re-implement embedding. See 14.6-BRIEF.md "(third) —
// Starter-corpus seeder" for the authoritative spec.
//
// Usage:
//   npx tsx scripts/seed-regulatory.ts [--validate-only]
//
// Pre-validation (validateManifest) runs BEFORE any embedding/DB call, always. On any failure the
// aggregated report is printed and the process exits non-zero — zero embedding spend on a bad batch.
//
// Requires env (from .env) for the non-validate path: VITE_SUPABASE_URL (or SUPABASE_URL),
// SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { PDFParse } from 'pdf-parse'
import { STARTER_MANIFEST, type ManifestEntry } from './regulatory-starter-manifest'
import { embedBatch } from './ingest-regulatory'
import { chunkDocument } from '../src/lib/chunker'

export const DEFAULT_DOCS_ROOT = 'regulatory-docs'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  order: ManifestEntry[]
}

/**
 * validateManifest aggregates ALL failures across the whole manifest (never throws / short-circuits on
 * the first problem found) checking:
 *   a. no duplicate documentKeys
 *   b. every referenced folder `regulatory-docs/<folder ?? documentKey>` exists with >=1 *.pdf
 *      (folder values containing path separators or '..' are rejected as a validation error — T-14.6-08)
 *   c. every `supersedes` target value is itself a documentKey present in the manifest
 *   d. the supersedes graph is acyclic
 * and computes the dependency-ordered processing order (predecessor before the entry that supersedes
 * it) via topological sort. On ANY failure, returns { ok:false, errors, order: [] } — callers must never
 * partially process an invalid batch.
 */
export function validateManifest(
  entries: ManifestEntry[],
  docsRoot: string = DEFAULT_DOCS_ROOT,
): ValidationResult {
  const errors: string[] = []

  // a. duplicate documentKey check
  const keyCounts = new Map<string, number>()
  for (const e of entries) {
    keyCounts.set(e.documentKey, (keyCounts.get(e.documentKey) ?? 0) + 1)
  }
  for (const [key, count] of keyCounts) {
    if (count > 1) errors.push(`duplicate documentKey: '${key}' appears ${count} times in the manifest`)
  }

  // First-occurrence map used for supersedes-target resolution and ordering.
  const byKey = new Map<string, ManifestEntry>()
  for (const e of entries) {
    if (!byKey.has(e.documentKey)) byKey.set(e.documentKey, e)
  }

  // b. folder + PDF existence (with path-safety guard — T-14.6-08: constrain reads under docsRoot,
  // reject folder values that could escape it).
  for (const e of entries) {
    const folder = e.folder ?? e.documentKey
    if (folder.includes('/') || folder.includes('\\') || folder.includes('..')) {
      errors.push(
        `invalid folder for '${e.documentKey}': '${folder}' must not contain path separators or '..'`,
      )
      continue
    }
    const dir = join(docsRoot, folder)
    if (!existsSync(dir)) {
      errors.push(`missing folder for '${e.documentKey}': ${dir} does not exist`)
      continue
    }
    let pdfCount = 0
    try {
      pdfCount = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).length
    } catch {
      errors.push(`unable to read folder for '${e.documentKey}': ${dir}`)
      continue
    }
    if (pdfCount === 0) {
      errors.push(`missing PDF(s) for '${e.documentKey}': ${dir} contains no *.pdf files`)
    }
  }

  // c. supersedes target presence
  for (const e of entries) {
    if (e.supersedes && !byKey.has(e.supersedes)) {
      errors.push(
        `supersedes target not found for '${e.documentKey}': '${e.supersedes}' is not a documentKey present in this manifest`,
      )
    }
  }

  // d. acyclicity + dependency order (Kahn's algorithm). A supersedes B means B must be processed
  // BEFORE A (the predecessor/target comes first). Self-referencing supersedes is also a cycle.
  const { order, cycle, cycleKeys } = topoSortBySupersedes(entries, byKey)
  if (cycle) {
    errors.push(`supersedes graph contains a cycle involving: ${cycleKeys.join(', ')}`)
  }

  if (errors.length > 0) {
    return { ok: false, errors, order: [] }
  }
  return { ok: true, errors: [], order }
}

function topoSortBySupersedes(
  entries: ManifestEntry[],
  byKey: Map<string, ManifestEntry>,
): { order: ManifestEntry[]; cycle: boolean; cycleKeys: string[] } {
  const adjacency = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const key of byKey.keys()) {
    indegree.set(key, 0)
    adjacency.set(key, [])
  }
  for (const e of entries) {
    if (!byKey.has(e.documentKey)) continue // duplicate non-first occurrence — skip for graph purposes
    if (e.supersedes && byKey.has(e.supersedes)) {
      // edge: target (predecessor) -> entry (successor); successor's indegree increments
      adjacency.get(e.supersedes)!.push(e.documentKey)
      indegree.set(e.documentKey, (indegree.get(e.documentKey) ?? 0) + 1)
    }
  }

  const queue: string[] = [...indegree.entries()].filter(([, deg]) => deg === 0).map(([k]) => k)
  queue.sort()
  const orderedKeys: string[] = []
  while (queue.length > 0) {
    const key = queue.shift()!
    orderedKeys.push(key)
    for (const succ of adjacency.get(key) ?? []) {
      indegree.set(succ, (indegree.get(succ) ?? 0) - 1)
      if (indegree.get(succ) === 0) queue.push(succ)
    }
    queue.sort()
  }

  const cycle = orderedKeys.length !== indegree.size
  const cycleKeys = cycle ? [...indegree.keys()].filter((k) => !orderedKeys.includes(k)) : []
  const order = orderedKeys.map((k) => byKey.get(k)!).filter(Boolean)
  return { order, cycle, cycleKeys }
}

// ---- Minimal .env loader (verbatim pattern from scripts/ingest-regulatory.ts) ----
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (out[key] === undefined || out[key] === '') out[key] = val
    }
  } catch {
    // .env optional if vars already in process.env
  }
  return out
}

// ---- PDF text extraction (pdf-parse v2 class API — mirrors scripts/ingest-regulatory.ts) ----
async function extractPdfText(path: string): Promise<string> {
  const buffer = readFileSync(path)
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

interface IngestEnv {
  supabaseUrl: string
  serviceKey: string
  openaiKey: string
}

/**
 * Ingest a single manifest entry: read its PDFs, chunk, embed (reused embedBatch — never
 * re-implemented), and write atomically via the ingest_regulatory_document RPC. Throws on any failure
 * (including an RPC raise, e.g. an unresolved --supersedes target) so the caller can abort the whole
 * run and report which entry failed — all-or-nothing at the batch level.
 */
async function ingestEntry(entry: ManifestEntry, docsRoot: string, env: IngestEnv): Promise<void> {
  const folder = entry.folder ?? entry.documentKey
  const dir = join(docsRoot, folder)
  const pdfFiles = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort()
  if (pdfFiles.length === 0) {
    throw new Error(`No PDF files found for '${entry.documentKey}' in ${dir}`)
  }

  console.log(
    `Ingesting '${entry.documentKey}' (agency=${entry.agency}, geography=${entry.geography.join(',')})` +
      `${entry.supersedes ? ` supersedes=${entry.supersedes}` : ''}`,
  )

  const allChunks: Array<{ content: string; sectionRef?: string; tokenCount: number; source: string }> = []
  for (const filename of pdfFiles) {
    const text = await extractPdfText(join(dir, filename))
    const chunks = chunkDocument(text, filename)
    console.log(`  ${filename}: ${chunks.length} chunk(s)`)
    for (const c of chunks) {
      allChunks.push({ content: c.content, sectionRef: c.sectionRef, tokenCount: c.tokenCount, source: filename })
    }
  }

  const primaryFilename = pdfFiles[0]
  const embeddings = await embedBatch(allChunks.map((c) => c.content), env.openaiKey)
  if (embeddings.length !== allChunks.length) {
    throw new Error(
      `Embedding count mismatch for '${entry.documentKey}': ${embeddings.length} != ${allChunks.length}`,
    )
  }

  const pChunks = allChunks.map((c, i) => ({
    content: c.content,
    embedding: embeddings[i],
    guideline_type: c.sectionRef ?? null,
    source: c.source,
    token_count: c.tokenCount,
  }))

  const supabase = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } })

  const { data, error } = await supabase.rpc('ingest_regulatory_document', {
    p_document_key: entry.documentKey,
    p_title: entry.title,
    p_agency: entry.agency,
    p_therapeutic_area: entry.therapeuticArea ?? null,
    p_phase: entry.phase ?? null,
    p_geography: entry.geography,
    p_effective_date: entry.effectiveDate ?? null,
    p_status: entry.status ?? 'active',
    p_source: primaryFilename,
    p_supersedes_document_key: entry.supersedes ?? null,
    p_chunks: pChunks,
  })

  if (error) {
    throw new Error(`ingest_regulatory_document RPC error for '${entry.documentKey}': ${error.message}`)
  }

  console.log(`  Done. regulatory_documents.id = ${data} (${pChunks.length} chunk(s) written).`)
}

/**
 * Runs the ingest loop over the pre-validated, dependency-ordered entries. All-or-nothing: aborts on
 * the first entry that fails (including an RPC raise) and lets the caller report the failure and exit
 * non-zero — never continues past a failed entry.
 */
async function runIngest(order: ManifestEntry[], docsRoot: string): Promise<void> {
  const env = loadEnv()
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = env.OPENAI_API_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!openaiKey) {
    throw new Error('Missing OPENAI_API_KEY')
  }

  for (const entry of order) {
    await ingestEntry(entry, docsRoot, { supabaseUrl, serviceKey, openaiKey })
  }

  console.log(`\nSeed complete. ${order.length} document(s) ingested in dependency order.`)
}

// ---- CLI entrypoint ----

/**
 * `entries`/`docsRoot` are overridable so tests can exercise main() against fixture manifests without
 * touching STARTER_MANIFEST or the real regulatory-docs/ tree.
 */
export async function main(
  argv: string[] = process.argv.slice(2),
  entries: ManifestEntry[] = STARTER_MANIFEST,
  docsRoot: string = DEFAULT_DOCS_ROOT,
) {
  const validateOnly = argv.includes('--validate-only')

  const { ok, errors, order } = validateManifest(entries, docsRoot)

  if (!ok) {
    console.error(`Manifest pre-validation FAILED (${errors.length} error(s)) — no embedding or DB call made:`)
    for (const err of errors) console.error(`  - ${err}`)
    process.exit(1)
    return
  }

  console.log(`Manifest pre-validation passed. Processing order: ${order.map((e) => e.documentKey).join(' -> ')}`)

  if (validateOnly) {
    console.log('--validate-only: exiting without embedding or DB writes.')
    process.exit(0)
    return
  }

  await runIngest(order, docsRoot)
  process.exit(0)
}

// Only auto-run when executed directly (not when imported by Vitest).
const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
