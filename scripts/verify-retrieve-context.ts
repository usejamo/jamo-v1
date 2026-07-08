// scripts/verify-retrieve-context.ts
// E2E probe of the deployed retrieve-context edge function via the INTERNAL
// service-role path (the same path chat-with-jamo/rag.ts uses in production).
// Loads keys from .env so no secrets are printed.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (out[m[1]] === undefined || out[m[1]] === '') out[m[1]] = val
  }
  return out
}

async function main() {
  const env = loadEnv()
  const base = (env.VITE_SUPABASE_URL || env.SUPABASE_URL).replace(/\/$/, '')
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const orgId = process.argv.find((a) => a.startsWith('--org-id='))?.split('=')[1] ?? '00000000-0000-0000-0000-000000000001'
  const query = process.argv.find((a) => a.startsWith('--query='))?.split('=')[1] ?? 'clinical trial safety monitoring requirements'

  const resp = await fetch(`${base}/functions/v1/retrieve-context`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId, query }),
  })
  const json = (await resp.json()) as Record<string, unknown>
  const meta = json.retrievalMeta as Record<string, unknown> | undefined
  const reg = (json.regulatoryChunks as unknown[] | undefined) ?? []
  const prop = (json.proposalChunks as unknown[] | undefined) ?? []
  console.log(`HTTP ${resp.status}`)
  console.log(`query: "${query}"  org: ${orgId}`)
  console.log(`regulatoryChunks: ${reg.length}   proposalChunks: ${prop.length}`)
  console.log(`retrievalMeta: ${JSON.stringify(meta)}`)
  const sample = prop.slice(0, 2).map((c: any) => ({ source: c.source, score: c.final_score?.toFixed?.(3), preview: String(c.content).slice(0, 90) }))
  console.log(`proposal sample: ${JSON.stringify(sample, null, 2)}`)
  if (!resp.ok) process.exit(1)
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
