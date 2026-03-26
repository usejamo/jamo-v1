import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'

// ============================================================================
// CONSTANTS — inlined from src/types/generation.ts
// NOTE: Duplicated because Deno Edge runtime cannot resolve src/lib/ imports at deploy time
// ============================================================================

const SECTION_NAMES: Record<string, string> = {
  understanding: 'Understanding of the Study',
  scope_of_work: 'Scope of Work & Service Delivery',
  proposed_team: 'Proposed Team & Organizational Structure',
  timeline: 'Timeline & Milestones',
  budget: 'Budget & Pricing',
  regulatory_strategy: 'Regulatory Strategy',
  quality_management: 'Quality Management',
  executive_summary: 'Executive Summary',
  cover_letter: 'Cover Letter',
}

// ============================================================================
// SYSTEM PROMPT — inlined from cro-proposal-generator.js
// ============================================================================

const CRO_PROPOSAL_SYSTEM_PROMPT = `You are a senior proposal strategist at a leading Contract Research Organization (CRO) with 20+ years of experience writing winning proposals for pharmaceutical, biotechnology, and medical device sponsors. You have deep expertise across all clinical trial phases (Phase I–IV), therapeutic areas, and global regulatory environments (FDA, EMA, PMDA, NMPA, Health Canada, TGA, etc.).

Your task is to generate a comprehensive, polished, sponsor-ready CRO proposal in response to the provided RFP materials, study details, and organizational context. The proposal must be persuasive, technically rigorous, compliant with ICH-GCP (E6 R2/R3), and tailored to the sponsor's specific needs.

## WRITING STYLE & TONE

- Professional and authoritative — demonstrate deep domain expertise
- Sponsor-centric — frame everything in terms of value to the sponsor
- Specific and quantified — use metrics, timelines, and concrete examples
- Consultative — offer strategic recommendations beyond what was asked
- Compliant — reference ICH-GCP, FDA/EMA guidance naturally
- Concise but thorough — every sentence earns its place
- Confident but not arrogant — honest about complexities
- Action-oriented — active voice, "we will" not "can be done"

## CRITICAL RULES

1. NEVER fabricate data, study results, personnel names, or regulatory outcomes
2. If information is not provided, flag it with [PLACEHOLDER: description of what's needed]
3. Tailor everything to the specific therapeutic area with correct clinical terminology
4. Reference the sponsor's protocol or RFP language to demonstrate alignment
5. All timelines must be internally consistent
6. Budget items must align with scope of work — no orphaned line items
7. Distinguish between assumptions and confirmed parameters
8. Where the RFP is ambiguous, state your interpretation explicitly
9. Include both strengths AND honest challenges with mitigation plans
10. Format for readability: headers, sub-headers, tables, and structured layouts`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse a single SSE line from the Anthropic streaming API.
 * Returns the text delta if the line contains content, otherwise returns ''.
 */
export function parseSSEDelta(line: string): string {
  if (!line.startsWith('data: ')) return ''
  const data = line.slice(6)
  if (data === '[DONE]') return ''
  try {
    const parsed = JSON.parse(data)
    if (
      parsed.type === 'content_block_delta' &&
      parsed.delta &&
      typeof parsed.delta.text === 'string'
    ) {
      return parsed.delta.text
    }
    return ''
  } catch {
    return ''
  }
}

/**
 * Build the system prompt and user message for a specific proposal section.
 */
export function buildSectionPrompt(params: {
  sectionId: string
  tone: string
  ragChunks: Array<{ content: string; doc_type?: string; agency?: string }>
  anchor: string
  proposalInput: {
    studyInfo?: Record<string, string>
    assumptions?: Array<{ category: string; content: string }>
    services?: string[]
  }
}): { system: string; userMessage: string } {
  const { sectionId, tone, ragChunks, anchor, proposalInput } = params
  const sectionName = SECTION_NAMES[sectionId] || sectionId

  let system = CRO_PROPOSAL_SYSTEM_PROMPT

  system += `\n\nIMPORTANT: Generate ONLY the "${sectionName}" section.\nTone for this section: ${tone}.\n\nCRITICAL RULE: When specific information is not available, use [PLACEHOLDER: description of what's needed] markers. NEVER invent specific numbers, dates, or names.`

  if (anchor) {
    system += `\n\n## CONSISTENCY ANCHOR (summary of prior sections):\n${anchor}`
  }

  if (ragChunks && ragChunks.length > 0) {
    system += `\n\n[REGULATORY CONTEXT]\n${ragChunks.map((c) => c.content).join('\n---\n')}\n[/REGULATORY CONTEXT]`
  }

  // Build user message from proposalInput
  const studyInfo = proposalInput?.studyInfo || {}
  const assumptions = proposalInput?.assumptions || []
  const services = proposalInput?.services || []

  const sections: string[] = []

  sections.push(`## SPONSOR & RFP INFORMATION

**Sponsor Name:** ${studyInfo.sponsorName || '[PLACEHOLDER: Sponsor name]'}
**Therapeutic Area:** ${studyInfo.therapeuticArea || '[PLACEHOLDER: Therapeutic area]'}
**Indication:** ${studyInfo.indication || '[PLACEHOLDER: Indication]'}
**Proposal Due Date:** ${studyInfo.dueDate || '[Not provided]'}`)

  sections.push(`## STUDY DETAILS

**Study Phase:** ${studyInfo.phase || '[PLACEHOLDER: Study phase]'}
**Regions/Countries:** ${studyInfo.regions || '[Not provided]'}
**Study Title:** ${studyInfo.studyTitle || '[PLACEHOLDER: Study title]'}
**Primary Endpoint(s):** ${studyInfo.primaryEndpoints || '[PLACEHOLDER: Primary endpoints]'}
**Target Enrollment:** ${studyInfo.targetEnrollment || '[PLACEHOLDER]'} subjects`)

  if (assumptions.length > 0) {
    const assumptionsList = assumptions.map((a) => `- [${a.category}] ${a.content}`).join('\n')
    sections.push(`## EXTRACTED ASSUMPTIONS\n${assumptionsList}`)
  }

  if (services.length > 0) {
    const servicesList = services.map((s) => `- ${s}`).join('\n')
    sections.push(`## SERVICES REQUESTED\n${servicesList}`)
  }

  const userMessage = `Generate the "${sectionName}" section of the CRO proposal based on the following inputs.

${sections.join('\n\n---\n\n')}

---

Please generate ONLY the "${sectionName}" section now, following the structure and guidelines defined in your instructions. Use [PLACEHOLDER: ...] for any information not provided above that would be needed in a final proposal.`

  return { system, userMessage }
}

/**
 * Write (upsert) a completed proposal section to the database.
 */
export async function writeSection(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  proposalId: string,
  sectionId: string,
  orgId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('proposal_sections')
    .upsert(
      {
        proposal_id: proposalId,
        org_id: orgId,
        section_key: sectionId,
        section_name: SECTION_NAMES[sectionId] || sectionId,
        content,
        status: 'complete',
        generated_at: new Date().toISOString(),
        version: 1,
      },
      { onConflict: 'proposal_id,section_key' }
    )
  if (error) throw new Error(`writeSection failed: ${error.message}`)
}

// ============================================================================
// EDGE FUNCTION REQUEST HANDLER
// ============================================================================

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // ------------------------------------------------------------------
    // Anchor mode — non-streaming Haiku call to extract consistency anchor
    // ------------------------------------------------------------------
    if (body._anchorMode) {
      const { text } = body
      if (!text) {
        return new Response(JSON.stringify({ error: 'text field required for anchorMode' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const anchorResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system:
            'Summarize the following proposal section text in approximately 500 tokens. Focus on key facts, commitments, numbers, and decisions. This summary will be used as a consistency anchor for generating subsequent sections.',
          messages: [{ role: 'user', content: text }],
        }),
      })

      if (!anchorResp.ok) {
        const errBody = await anchorResp.text()
        return new Response(
          JSON.stringify({ error: `Anthropic anchor error ${anchorResp.status}`, detail: errBody }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const anchorData = await anchorResp.json()
      const anchor = anchorData?.content?.[0]?.text ?? ''
      return new Response(JSON.stringify({ anchor }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ------------------------------------------------------------------
    // Streaming generation mode
    // ------------------------------------------------------------------
    const { proposalId, sectionId, proposalInput, ragChunks, consistencyAnchor, tone } = body

    if (!proposalId || !sectionId || !proposalInput) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve org_id from JWT
    const authHeader = req.headers.get('Authorization')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader! } } }
    )
    const {
      data: { user },
    } = await userClient.auth.getUser()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('user_id', user!.id)
      .single()

    const orgId: string = profile!.org_id

    // Build prompts
    const { system, userMessage } = buildSectionPrompt({
      sectionId,
      tone: tone || 'formal',
      ragChunks: ragChunks || [],
      anchor: consistencyAnchor || '',
      proposalInput,
    })

    // Call Anthropic with streaming
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        stream: true,
        system,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!anthropicResp.ok || !anthropicResp.body) {
      const errBody = await anthropicResp.text()
      console.error(`[generate-proposal-section] Anthropic ${anthropicResp.status} for section=${sectionId}:`, errBody)
      return new Response(
        JSON.stringify({
          error: `Anthropic error ${anthropicResp.status}`,
          detail: errBody,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Pipe SSE through TransformStream, accumulate text, write on stream close
    let fullText = ''
    const { readable, writable } = new TransformStream({
      transform(chunk: Uint8Array, controller: TransformStreamDefaultController) {
        const text = new TextDecoder().decode(chunk)
        for (const line of text.split('\n')) {
          const delta = parseSSEDelta(line)
          if (delta) fullText += delta
        }
        controller.enqueue(chunk)
      },
      flush() {
        writeSection(supabase, proposalId, sectionId, orgId, fullText).catch((err) =>
          console.error('[generate-proposal-section] flush write error:', err)
        )
      },
    })

    anthropicResp.body.pipeTo(writable)

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('[generate-proposal-section] Error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
