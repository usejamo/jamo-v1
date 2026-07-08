// scripts/backfill-proposal-chunks.ts
// One-time backfill: read existing public.document_extracts, chunk + embed their
// text, and insert doc_type='proposal' rows into public.chunks.
//
// Root cause this repairs: the proposal ingestion path (document_extracts -> chunk
// -> embed -> chunks) was never built. extract-document stops after writing
// document_extracts; nothing produced proposal chunks, so RAG returned nothing.
//
// Reuses the existing, tested chunker (src/lib/chunker.ts) and the same embedding
// model as retrieve-context (OpenAI text-embedding-3-small, 1536 dims).
//
// Idempotent: deletes existing doc_type='proposal' chunks for each processed org
// before re-inserting, so it can be re-run safely.
//
// Usage:
//   npx tsx scripts/backfill-proposal-chunks.ts            # backfill all orgs
//   npx tsx scripts/backfill-proposal-chunks.ts --dry-run  # chunk + count only
//   npx tsx scripts/backfill-proposal-chunks.ts --org-id=<uuid>

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chunkDocument } from '../src/lib/chunker.ts'

const EMBED_MODEL = 'text-embedding-3-small'
const EMBED_DIMS = 1536
const EMBED_BATCH_SIZE = 100
const INSERT_BATCH_SIZE = 200

// ---- Minimal .env loader (avoids a hard dotenv dependency) ----
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

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
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

async function main() {
  const env = loadEnv()
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const orgArg = args.find((a) => a.startsWith('--org-id='))?.split('=')[1] ?? null

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const openaiKey = env.OPENAI_API_KEY

  if (!supabaseUrl || !serviceKey) throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  if (!openaiKey && !isDryRun) throw new Error('Missing OPENAI_API_KEY (or use --dry-run)')

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Pull extracts + their document name (used as chunk `source` for citations).
  let query = supabase
    .from('document_extracts')
    .select('id, org_id, content, document_id, proposal_documents(name)')
    .not('content', 'is', null)
    .neq('content', '')
  if (orgArg) query = query.eq('org_id', orgArg)

  const { data: extracts, error: exErr } = await query
  if (exErr) throw new Error(`Failed to read document_extracts: ${exErr.message}`)
  if (!extracts || extracts.length === 0) {
    console.log('No extracts found to backfill.')
    return
  }

  console.log(`Loaded ${extracts.length} extract(s)${isDryRun ? ' | DRY RUN' : ''}`)

  type Row = {
    org_id: string
    doc_type: 'proposal'
    source: string
    content: string
    embedding: number[]
    metadata: Record<string, unknown>
  }

  // Chunk everything first, tracking org + source per chunk.
  const pending: Array<{ org_id: string; source: string; content: string; document_id: string; tokenCount: number; sectionRef?: string }> = []
  const orgsSeen = new Set<string>()
  for (const ex of extracts) {
    const doc = (ex as { proposal_documents?: { name?: string } | { name?: string }[] }).proposal_documents
    const name = Array.isArray(doc) ? doc[0]?.name : doc?.name
    const source = name || `document:${(ex as { document_id: string }).document_id}`
    const chunks = chunkDocument((ex as { content: string }).content, source)
    orgsSeen.add((ex as { org_id: string }).org_id)
    for (const c of chunks) {
      pending.push({
        org_id: (ex as { org_id: string }).org_id,
        source,
        content: c.content,
        document_id: (ex as { document_id: string }).document_id,
        tokenCount: c.tokenCount,
        sectionRef: c.sectionRef,
      })
    }
  }

  console.log(`Produced ${pending.length} chunk(s) across ${orgsSeen.size} org(s)`)
  if (isDryRun) {
    console.log('Dry run — no embeddings, no DB writes.')
    return
  }

  // Embed all chunk texts.
  const embeddings = await embedBatch(pending.map((p) => p.content), openaiKey!)
  if (embeddings.length !== pending.length) {
    throw new Error(`Embedding count mismatch: ${embeddings.length} != ${pending.length}`)
  }

  const rows: Row[] = pending.map((p, i) => ({
    org_id: p.org_id,
    doc_type: 'proposal',
    source: p.source,
    content: p.content,
    embedding: embeddings[i],
    metadata: { document_id: p.document_id, tokenCount: p.tokenCount, sectionRef: p.sectionRef ?? null },
  }))

  // Idempotency: clear existing proposal chunks for each org we're backfilling.
  for (const org of orgsSeen) {
    const { error: delErr } = await supabase.from('chunks').delete().eq('org_id', org).eq('doc_type', 'proposal')
    if (delErr) throw new Error(`Failed clearing existing proposal chunks for ${org}: ${delErr.message}`)
  }

  // Insert in batches.
  let inserted = 0
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + INSERT_BATCH_SIZE)
    const { error: insErr } = await supabase.from('chunks').insert(batch)
    if (insErr) throw new Error(`Insert failed at batch ${i}: ${insErr.message}`)
    inserted += batch.length
    console.log(`  Inserted ${inserted}/${rows.length}`)
  }

  console.log(`\nDone. Inserted ${inserted} proposal chunk(s).`)
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
