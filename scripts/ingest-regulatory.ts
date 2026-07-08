// scripts/ingest-regulatory.ts
// tsx/Node CLI for seeding versioned regulatory documents into the chunks table.
// Ported from Deno (LOCKED Post-Research Decision #1) — mirrors scripts/backfill-proposal-chunks.ts:
// raw-fetch OpenAI embeddings (no `openai` package), loadEnv, node:fs. All chunks in a run belong to
// one logical document (--document-key) and are written atomically via the ingest_regulatory_document RPC.
//
// Usage:
//   npx tsx scripts/ingest-regulatory.ts \
//     --document-key=ICH-E6R2 --agency=ICH --geography=US,EU,GLOBAL \
//     --dir=./regulatory-docs/ICH-E6R2 [--therapeutic-area=Oncology] [--phase=Phase 2,Phase 3] \
//     [--effective-date=2016-11-09] [--status=active] [--supersedes=ICH-E6R1] [--dry-run]
//
// Requires env (from .env): VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { PDFParse } from 'pdf-parse'
import { chunkDocument } from '../src/lib/chunker.ts'

const EMBED_MODEL = 'text-embedding-3-small'
const EMBED_DIMS = 1536
export const EMBED_BATCH_SIZE = 100

// ---- Minimal .env loader (verbatim from backfill-proposal-chunks.ts) ----
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

// ---- Flag parsing (pure, testable) ----

export interface RegulatoryIngestFlags {
  documentKey: string
  title: string | null
  agency: string
  therapeuticArea: string | null
  phase: string[] | null
  geography: string[]
  effectiveDate: string | null
  status: string
  supersedes: string | null
  dir: string
  dryRun: boolean
}

function getFlag(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : undefined
}

/**
 * parseFlags extracts the regulatory-ingest CLI flags from argv.
 * Throws on any missing required flag (--document-key, --geography, --dir, --agency) so the caller
 * exits non-zero; unit-testable with no I/O.
 */
export function parseFlags(argv: string[]): RegulatoryIngestFlags {
  const documentKey = getFlag(argv, 'document-key')
  const geographyRaw = getFlag(argv, 'geography')
  const dir = getFlag(argv, 'dir')
  const agency = getFlag(argv, 'agency')

  const missing: string[] = []
  if (!documentKey) missing.push('--document-key')
  if (!geographyRaw) missing.push('--geography')
  if (!dir) missing.push('--dir')
  if (!agency) missing.push('--agency')
  if (missing.length > 0) {
    throw new Error(
      `Missing required flag(s): ${missing.join(', ')}. ` +
        `Usage: npx tsx scripts/ingest-regulatory.ts --document-key=<key> --agency=<ICH|FDA|EMA> ` +
        `--geography=<US,EU,GLOBAL> --dir=<pdf-dir> [--therapeutic-area=] [--phase=] ` +
        `[--effective-date=] [--status=active] [--supersedes=<predecessor-key>] [--dry-run]`,
    )
  }

  const splitList = (v: string | undefined): string[] | null =>
    v ? v.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : null

  return {
    documentKey: documentKey!,
    title: getFlag(argv, 'title') ?? null,
    agency: agency!,
    therapeuticArea: getFlag(argv, 'therapeutic-area') ?? null,
    phase: splitList(getFlag(argv, 'phase')),
    geography: splitList(geographyRaw)!,
    effectiveDate: getFlag(argv, 'effective-date') ?? null,
    status: getFlag(argv, 'status') ?? 'active',
    supersedes: getFlag(argv, 'supersedes') ?? null,
    dir: dir!,
    dryRun: argv.includes('--dry-run'),
  }
}

// ---- Embeddings (raw fetch, testable — mirrors backfill-proposal-chunks.ts) ----

export async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    let attempt = 0
    let backoff = 1000
    while (true) {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        if ((resp.status === 429 || resp.status >= 500) && attempt < 4) {
          attempt++
          await new Promise((r) => setTimeout(r, backoff))
          backoff *= 2
          continue
        }
        throw new Error(`OpenAI embeddings failed (${resp.status}): ${body}`)
      }
      const json = (await resp.json()) as { data: Array<{ embedding: number[]; index: number }> }
      const sorted = json.data.sort((a, b) => a.index - b.index)
      for (const item of sorted) {
        if (item.embedding.length !== EMBED_DIMS) {
          throw new Error(`Embedding dim mismatch: expected ${EMBED_DIMS}, got ${item.embedding.length}`)
        }
        results.push(item.embedding)
      }
      break
    }
    if (i + EMBED_BATCH_SIZE < texts.length) await new Promise((r) => setTimeout(r, 150))
  }
  return results
}

// ---- PDF text extraction (pdf-parse v2 class API) ----
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

// ---- CLI entrypoint ----

async function main() {
  const env = loadEnv()
  const flags = parseFlags(process.argv.slice(2))

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = env.OPENAI_API_KEY

  if (!flags.dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or use --dry-run)')
  }
  if (!flags.dryRun && !openaiKey) {
    throw new Error('Missing OPENAI_API_KEY (or use --dry-run)')
  }

  const pdfFiles = readdirSync(flags.dir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort()
  if (pdfFiles.length === 0) {
    throw new Error(`No PDF files found in --dir=${flags.dir}`)
  }

  console.log(
    `Ingesting document-key='${flags.documentKey}' (agency=${flags.agency}, geography=${flags.geography.join(',')})` +
      `${flags.supersedes ? ` supersedes=${flags.supersedes}` : ''}${flags.dryRun ? ' | DRY RUN' : ''}`,
  )
  console.log(`PDFs in ${flags.dir}: ${pdfFiles.join(', ')}`)

  // All PDFs in the dir belong to the ONE logical document (--document-key).
  const allChunks: Array<{ content: string; sectionRef?: string; tokenCount: number; source: string }> = []
  for (const filename of pdfFiles) {
    const text = await extractPdfText(join(flags.dir, filename))
    const chunks = chunkDocument(text, filename)
    console.log(`  ${filename}: ${chunks.length} chunk(s)`)
    for (const c of chunks) {
      allChunks.push({ content: c.content, sectionRef: c.sectionRef, tokenCount: c.tokenCount, source: filename })
    }
  }

  const primaryFilename = pdfFiles[0]
  console.log(`Total chunks: ${allChunks.length}`)

  if (flags.dryRun) {
    console.log('Dry run — no embeddings, no DB writes.')
    return
  }

  const embeddings = await embedBatch(allChunks.map((c) => c.content), openaiKey!)
  if (embeddings.length !== allChunks.length) {
    throw new Error(`Embedding count mismatch: ${embeddings.length} != ${allChunks.length}`)
  }

  const pChunks = allChunks.map((c, i) => ({
    content: c.content,
    embedding: embeddings[i],
    guideline_type: c.sectionRef ?? null,
    source: c.source,
    token_count: c.tokenCount,
  }))

  const supabase = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } })

  const { data, error } = await supabase.rpc('ingest_regulatory_document', {
    p_document_key: flags.documentKey,
    p_title: flags.title ?? flags.documentKey,
    p_agency: flags.agency,
    p_therapeutic_area: flags.therapeuticArea,
    p_phase: flags.phase,
    p_geography: flags.geography,
    p_effective_date: flags.effectiveDate,
    p_status: flags.status,
    p_source: primaryFilename,
    p_supersedes_document_key: flags.supersedes,
    p_chunks: pChunks,
  })

  if (error) {
    console.error(`ingest_regulatory_document RPC error: ${error.message}`)
    process.exit(1)
  }

  console.log(`\nDone. regulatory_documents.id = ${data} (${pChunks.length} chunk(s) written).`)
}

// Only auto-run when executed directly (not when imported by Vitest).
const isMain =
  !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
