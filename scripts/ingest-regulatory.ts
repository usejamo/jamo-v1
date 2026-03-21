// scripts/ingest-regulatory.ts
// Dev-run CLI for seeding regulatory PDFs into the chunks table.
//
// Usage:
//   deno run --allow-net --allow-read --allow-env scripts/ingest-regulatory.ts \
//     --org-id=<uuid> --agency=ICH --dir=./regulatory-docs/ICH [--dry-run]
//
// Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY

// NOTE: This file is both the Deno CLI entrypoint and a Vitest-testable module.
// Top-level Deno-specific imports are guarded by typeof Deno check so Vitest can load the module.

// ---- Types ----

export interface OpenAIClient {
  embeddings: {
    create(params: { model: string; input: string[] }): Promise<{
      data: Array<{ embedding: number[]; index: number }>
    }>
  }
}

// ---- Constants ----

export const EMBED_BATCH_SIZE = 100
const BATCH_DELAY_MS = 150
const MAX_RETRIES = 3
const REQUIRED_DIMS = 1536

// ---- Core exportable function (testable) ----

/**
 * embedBatch takes an array of text strings and an OpenAI client, calls
 * embeddings.create in batches of EMBED_BATCH_SIZE, asserts each returned
 * embedding has exactly 1536 dimensions, and returns a flat number[][].
 *
 * Exported so scripts/ingest.test.ts can unit-test it with a mock client.
 */
export async function embedBatch(
  texts: string[],
  openai: OpenAIClient,
  delayMs = 0,
): Promise<number[][]> {
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)

    let attempt = 0
    let backoffMs = 1000

    while (true) {
      try {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch,
        })

        // Sort by index to preserve order (OpenAI may return out of order)
        const sorted = response.data.sort((a, b) => a.index - b.index)

        for (const item of sorted) {
          if (item.embedding.length !== REQUIRED_DIMS) {
            throw new Error(
              `Embedding dimension mismatch: expected ${REQUIRED_DIMS}, got ${item.embedding.length}`,
            )
          }
          results.push(item.embedding)
        }
        break // success
      } catch (err: unknown) {
        const isRateLimit =
          err instanceof Error &&
          (err.message.includes('429') || err.message.toLowerCase().includes('rate limit'))

        if (isRateLimit && attempt < MAX_RETRIES) {
          attempt++
          await sleep(backoffMs)
          backoffMs *= 2
          continue
        }
        throw err
      }
    }

    // Delay between batches (skip for last batch)
    const delay = delayMs > 0 ? delayMs : BATCH_DELAY_MS
    if (i + EMBED_BATCH_SIZE < texts.length) {
      await sleep(delay)
    }
  }

  return results
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---- CLI entrypoint — only runs in Deno ----

async function main() {
  // Dynamic Deno imports — only available at runtime in Deno context
  // deno-only dynamic imports — vite-ignore prevents Vite/Vitest from resolving these
  const { parseArgs } = await import(/* @vite-ignore */ 'jsr:@std/cli/parse-args')
  const { walk } = await import(/* @vite-ignore */ 'jsr:@std/fs/walk')
  const { createClient } = await import(/* @vite-ignore */ 'npm:@supabase/supabase-js')
  const OpenAI = (await import(/* @vite-ignore */ 'npm:openai')).default
  const { chunkDocument } = await import(/* @vite-ignore */ '../src/lib/chunker.ts')

  const args = parseArgs(Deno.args, {
    string: ['org-id', 'agency', 'dir', 'therapeutic-area'],
    boolean: ['dry-run', 'help'],
    alias: { h: 'help' },
  })

  if (args.help) {
    console.log(`
ingest-regulatory.ts — Seed regulatory PDFs into the chunks table

Usage:
  deno run --allow-net --allow-read --allow-env scripts/ingest-regulatory.ts \\
    --org-id=<uuid> \\
    --agency=<ICH|FDA|EMA> \\
    --dir=<path-to-pdf-directory> \\
    [--therapeutic-area=<area>] \\
    [--dry-run]

Required flags:
  --org-id       UUID of the organisation to tag all chunks with
  --agency       Regulatory agency label (ICH, FDA, EMA, etc.)
  --dir          Directory to walk for PDF files

Optional flags:
  --therapeutic-area   Tag chunks with a therapeutic area
  --dry-run            Process and count chunks without writing to DB

Required env vars:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  OPENAI_API_KEY
`)
    Deno.exit(0)
  }

  const orgId = args['org-id']
  const agency = args['agency']
  const dir = args['dir']

  if (!orgId || !agency || !dir) {
    console.error('Error: --org-id, --agency, and --dir are required.')
    console.error('Run with --help for usage.')
    Deno.exit(1)
  }

  const isDryRun = args['dry-run'] ?? false
  const therapeuticArea = args['therapeutic-area'] ?? null

  // Env vars
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')

  if (!isDryRun && (!supabaseUrl || !serviceRoleKey)) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required (or use --dry-run).')
    Deno.exit(1)
  }
  if (!openaiKey) {
    console.error('Error: OPENAI_API_KEY env var required.')
    Deno.exit(1)
  }

  const openai = new OpenAI({ apiKey: openaiKey })
  const supabase = isDryRun
    ? null
    : createClient(supabaseUrl!, serviceRoleKey!)

  console.log(`Ingesting PDFs from: ${dir}`)
  console.log(`Agency: ${agency} | Org: ${orgId}${isDryRun ? ' | DRY RUN' : ''}`)

  let totalFiles = 0
  let totalChunks = 0
  let totalInserted = 0

  // Walk PDF files
  for await (const entry of walk(dir, { exts: ['pdf'], includeDirs: false })) {
    totalFiles++
    const filename = entry.name
    console.log(`\nProcessing: ${filename}`)

    // Read file bytes
    const bytes = await Deno.readFile(entry.path)

    // Extract text — use pdf-parse via npm
    let text = ''
    try {
      const pdfParse = (await import(/* @vite-ignore */ 'npm:pdf-parse/lib/pdf-parse.js')).default
      const result = await pdfParse(bytes)
      text = result.text
    } catch (err) {
      console.error(`  Failed to parse ${filename}:`, err)
      continue
    }

    // Chunk the document
    const chunks = chunkDocument(text, filename)
    totalChunks += chunks.length
    console.log(`  Chunks: ${chunks.length}`)

    if (isDryRun) continue

    // Embed chunks in batches
    const texts = chunks.map((c) => c.content)
    const embeddings = await embedBatch(texts, openai, BATCH_DELAY_MS)

    // Build rows for insert
    const rows = chunks.map((chunk, idx) => ({
      org_id: orgId,
      doc_type: 'regulatory',
      source: filename,
      content: chunk.content,
      embedding: embeddings[idx],
      agency,
      guideline_type: chunk.sectionRef ?? null,
      therapeutic_area: therapeuticArea,
      metadata: { tokenCount: chunk.tokenCount },
    }))

    // Bulk insert
    const { error } = await supabase!.from('chunks').insert(rows)
    if (error) {
      console.error(`  Insert error for ${filename}:`, error.message)
    } else {
      totalInserted += rows.length
      console.log(`  Inserted: ${rows.length} rows`)
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Files processed: ${totalFiles}`)
  console.log(`Total chunks:    ${totalChunks}`)
  if (!isDryRun) {
    console.log(`Embeddings inserted: ${totalInserted}`)
  } else {
    console.log(`Dry run — no DB writes.`)
  }
}

// Only auto-run when executed directly in Deno (not imported by Vitest)
if (typeof Deno !== 'undefined' && import.meta.main) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    Deno.exit(1)
  })
}
