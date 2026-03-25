import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'

// ============================================================================
// TYPES
// ============================================================================

interface ExtractAssumptionsRequest {
  proposalId: string
}

interface RawAssumption {
  category: string
  value: string
  confidence: number
  source: string
}

interface RawMissing {
  field: string
  description: string
}

interface ClaudeParseResult {
  assumptions: RawAssumption[]
  missing: RawMissing[]
}

// ============================================================================
// HELPERS
// ============================================================================

export function mapConfidence(confidence: number): string {
  if (confidence >= 0.8) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

export function parseClaudeResponse(content: string): ClaudeParseResult {
  // Strip markdown code fences
  const trimmed = content.trim()
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  // Replace literal (unescaped) newlines and tabs with spaces so JSON.parse
  // doesn't choke on multi-line string values that Claude sometimes emits.
  const normalized = stripped.replace(/\r?\n/g, ' ').replace(/\t/g, ' ')

  try {
    const parsed = JSON.parse(normalized)
    return {
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
    }
  } catch {
    // Fallback: find first balanced JSON object
    try {
      const start = normalized.indexOf('{')
      if (start === -1) return { assumptions: [], missing: [] }
      let depth = 0
      let end = -1
      for (let i = start; i < normalized.length; i++) {
        if (normalized[i] === '{') depth++
        else if (normalized[i] === '}') {
          depth--
          if (depth === 0) { end = i; break }
        }
      }
      if (end === -1) return { assumptions: [], missing: [] }
      const parsed = JSON.parse(normalized.slice(start, end + 1))
      return {
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
        missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      }
    } catch {
      return { assumptions: [], missing: [] }
    }
  }
}

// ============================================================================
// EDGE FUNCTION REQUEST HANDLER
// ============================================================================

serve(async (req) => {
  // CORS handling
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Parse and validate request
    const body = await req.json() as ExtractAssumptionsRequest
    const { proposalId } = body

    if (!proposalId) {
      return new Response(JSON.stringify({ error: 'proposalId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Create Supabase service role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 3. Fetch org_id from proposals table
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('org_id')
      .eq('id', proposalId)
      .single()

    if (proposalError || !proposal) {
      throw new Error(`Proposal not found: ${proposalId}`)
    }

    const orgId: string = proposal.org_id

    // 4. Fetch document IDs for this proposal, then fetch their extracts
    const { data: propDocs, error: propDocsError } = await supabase
      .from('proposal_documents')
      .select('id, name')
      .eq('proposal_id', proposalId)

    if (propDocsError) {
      throw new Error(`Failed to fetch proposal documents: ${propDocsError.message}`)
    }

    const docIds = (propDocs ?? []).map((d: { id: string }) => d.id)
    const docNameMap: Record<string, string> = {}
    for (const d of propDocs ?? []) {
      docNameMap[d.id] = d.name
    }

    const { data: extracts, error: extractsError } = docIds.length > 0
      ? await supabase
          .from('document_extracts')
          .select('content, document_id')
          .in('document_id', docIds)
      : { data: [], error: null }

    if (extractsError) {
      throw new Error(`Failed to fetch document extracts: ${extractsError.message}`)
    }

    const documents = (extracts ?? []).map((e: { content: string; document_id: string }) => ({
      content: e.content,
      proposal_documents: { name: docNameMap[e.document_id] ?? 'unknown' },
    }))

    // 5. Build user prompt — concatenate all document texts with headers
    // Filter out documents with no meaningful text content
    const docsWithContent = documents.filter((d: any) => d.content?.trim())

    if (docsWithContent.length === 0) {
      return new Response(JSON.stringify({
        assumptions: [],
        missing: [],
        warning: 'no_document_content',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let userContent = docsWithContent
      .map((d: any) => {
        const filename = d.proposal_documents?.name ?? 'unknown'
        const text = d.content ?? ''
        return `--- Document: ${filename} ---\n${text}`
      })
      .join('\n\n')

    // Truncate to ~32000 chars (~8000 tokens) if needed
    if (userContent.length > 32000) {
      userContent = userContent.slice(0, 32000)
    }

    // 6. Build system prompt
    const systemPrompt = `You are a clinical research assumption extractor. Extract key assumptions from CRO proposal documents. Return ONLY valid JSON matching this exact schema: { "assumptions": [{ "category": "sponsor_metadata|scope|timeline|budget|criteria", "value": "string", "confidence": 0.0-1.0, "source": "filename or inferred" }], "missing": [{ "field": "snake_case_field_name", "description": "human readable description" }] }`

    // 7. Call Anthropic claude-haiku via HTTP API
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
    })

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text()
      throw new Error(`Anthropic API error ${anthropicResponse.status}: ${errText}`)
    }

    const anthropicData = await anthropicResponse.json()
    const responseText: string = anthropicData?.content?.[0]?.text ?? ''
    // 8. Parse Claude response — graceful failure returns empty assumptions
    const parsed = parseClaudeResponse(responseText)

    // If parse failed (empty assumptions and no missing), indicate warning
    const parseWarning = parsed.assumptions.length === 0 && parsed.missing.length === 0 && responseText.length > 0
      ? 'parse_failed'
      : undefined

    // 9. Return response shape expected by frontend
    // NOTE: DB persistence of assumptions is handled by the frontend after receiving this response.
    // Keeping the insert here caused EarlyDrop (60s wall-clock limit hit by Anthropic + hanging insert).
    const responseBody: Record<string, unknown> = {
      assumptions: parsed.assumptions,
      missing: parsed.missing,
    }

    if (parseWarning) {
      responseBody.warning = parseWarning
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[extract-assumptions] Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
