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
  try {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) {
      return { assumptions: [], missing: [] }
    }
    const parsed = JSON.parse(match[0])
    return {
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
    }
  } catch {
    return { assumptions: [], missing: [] }
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

    // 4. Fetch document_extracts joined with proposal_documents for this proposal
    const { data: extracts, error: extractsError } = await supabase
      .from('document_extracts')
      .select(`
        content,
        proposal_documents!inner(name, proposal_id)
      `)
      .eq('proposal_documents.proposal_id', proposalId)

    if (extractsError) {
      throw new Error(`Failed to fetch document extracts: ${extractsError.message}`)
    }

    const documents = extracts ?? []

    // 5. Build user prompt — concatenate all document texts with headers
    let userContent = documents
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

    if (!userContent.trim()) {
      userContent = '(No document content available)'
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
        max_tokens: 2000,
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

    // 9. Map and bulk-insert into proposal_assumptions
    if (parsed.assumptions.length > 0) {
      const rows = parsed.assumptions.map((a: RawAssumption) => ({
        proposal_id: proposalId,
        org_id: orgId,
        category: a.category,
        content: a.value,           // DB column is 'content' not 'value'
        confidence: mapConfidence(a.confidence),
        status: 'pending',
        source_document: null,
        user_edited: false,
      }))

      const { error: insertError } = await supabase
        .from('proposal_assumptions')
        .insert(rows)

      if (insertError) {
        throw new Error(`Failed to insert assumptions: ${insertError.message}`)
      }
    }

    // 10. Return response shape expected by frontend
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
