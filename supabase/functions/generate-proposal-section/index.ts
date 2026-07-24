import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'
import { SECTION_NAMES, buildSectionPrompt, buildSectionPromptV2 } from './promptAssembly.ts'
import { parseStopReason, TRUNCATION_SENTINEL } from './truncationSignal.ts'

// Re-export the pure prompt-assembly builders so existing importers of
// index.ts (and the Deno test.ts suite) keep working. promptAssembly.ts is
// the single source of truth — Vitest (promptAssembly.test.ts) imports it
// directly, since index.ts's Deno-only imports above cannot resolve in Node.
export { buildSectionPrompt, buildSectionPromptV2 }

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
 * Escape HTML special characters for safe use in attributes and text content.
 * SYNC OBLIGATION: This function body must remain byte-for-byte identical to
 * src/lib/escapeHtml.ts escapeHtml(). Inlined because Deno Edge runtime cannot
 * resolve src/ imports at deploy time.
 */
function escapeHtmlInline(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Convert a [PLACEHOLDER: label] pattern to a span with stable data attributes.
 * Inlined from src/lib/placeholderHtml.ts — cannot import src/ in Deno Edge runtime.
 */
function placeholderPatternToSpan(label: string, id: string): string {
  const escaped = escapeHtmlInline(label.trim())
  return `<span data-placeholder-id="${id}" data-placeholder-label="${escaped}">${escaped}</span>`
}

/**
 * Write a completed proposal section by UUID (v2 — no upsert, just UPDATE).
 */
export async function writeSectionById(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  sectionId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('proposal_sections')
    .update({
      content,
      status: 'complete',
      generated_at: new Date().toISOString(),
    })
    .eq('id', sectionId)
  if (error) throw new Error(`writeSectionById failed: ${error.message}`)
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
    const isV2 = body.version === 2

    // V2 payload fields
    const {
      proposalId,
      sectionId,
      regulatoryChunks,
      proposalChunks,
      regulatoryCount,
      tone,
      debug,
    } = body

    // V2-specific
    const sectionName: string = isV2 ? body.sectionName : (SECTION_NAMES[sectionId] || sectionId)
    const sectionDescription: string | null = isV2 ? (body.sectionDescription ?? null) : null
    const sectionRole: string | null = isV2 ? (body.sectionRole ?? null) : null
    const priorSections: Array<{ id: string; name: string; content: string }> = isV2 ? (body.priorSections ?? []) : []
    const proposalContext = isV2 ? body.proposalContext : body.proposalInput
    const consistencyAnchor: string = body.consistencyAnchor ?? ''
    const templateContext = isV2 ? undefined : body.templateContext

    if (!proposalId || !sectionId || (!isV2 && !proposalContext)) {
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

    // Inject the CRO/org name so the model fills it instead of emitting a [CRO Name]
    // placeholder. Best-effort: a failed/missing read leaves croName undefined, and the
    // prompt falls back to [PLACEHOLDER: CRO name] — exactly today's behavior.
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
    if (orgErr) {
      console.error('generate-proposal-section: failed to load org name', orgErr.message)
    }
    const croName: string | undefined = org?.name ?? undefined

    // When the sponsor blinded the investigational product, write around it generically
    // instead of emitting a [PLACEHOLDER: Investigational product name] to be filled later.
    const investigationalProductUndisclosed: boolean = Boolean(proposalContext?.studyInfo?.investigationalProductUndisclosed)

    // Build prompts
    const { system: baseSystem, userMessage } = isV2
      ? buildSectionPromptV2({
          sectionId,
          sectionName,
          sectionDescription,
          sectionRole,
          tone: tone || 'formal',
          regulatoryChunks: regulatoryChunks || [],
          proposalChunks: proposalChunks || [],
          regulatoryCount: regulatoryCount ?? 0,
          consistencyAnchor,
          priorSections,
          proposalContext,
          croName,
          investigationalProductUndisclosed,
        })
      : buildSectionPrompt({
          sectionId,
          tone: tone || 'formal',
          regulatoryChunks: regulatoryChunks || [],
          proposalChunks: proposalChunks || [],
          regulatoryCount: regulatoryCount ?? 0,
          anchor: consistencyAnchor || '',
          proposalInput: proposalContext,
          templateContext,
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
        // 8000 (not 4000): comprehensive sections render as token-heavy HTML (tables, markup) and
        // overshoot their word target — a 1000–1200-word comprehensive section is ~3300–4500+ output
        // tokens, so 4000 clipped scope_of_work mid-generation. 8000 gives them headroom to finish;
        // the truncation guard (truncationSignal.ts) now trips only on genuine runaways. Sonnet 4.6
        // supports up to 64k output, so 8000 is well within model limits.
        max_tokens: debug ? 150 : 8000,
        stream: true,
        system: baseSystem,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!anthropicResp.ok || !anthropicResp.body) {
      const errBody = await anthropicResp.text()
      console.error(`[generate-proposal-section] Anthropic ${anthropicResp.status} for section=${sectionId}:`, errBody)
      // Surface "credit balance is too low" as 402 so the client can show a dedicated banner
      // instead of treating it as a generic upstream failure that gets silently retried.
      if (/credit balance is too low/i.test(errBody)) {
        return new Response(
          JSON.stringify({ error: 'insufficient_credits', detail: errBody }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
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
    let stopReason: string | null = null
    const { readable, writable } = new TransformStream({
      transform(chunk: Uint8Array, controller: TransformStreamDefaultController) {
        const text = new TextDecoder().decode(chunk)
        for (const line of text.split('\n')) {
          const delta = parseSSEDelta(line)
          if (delta) fullText += delta
          const sr = parseStopReason(line)
          if (sr) stopReason = sr
        }
        controller.enqueue(chunk)
      },
      async flush(controller: TransformStreamDefaultController) {
        // Truncated at the token ceiling: do NOT persist. Leaving the proposal_sections row
        // blank routes it into demo-capture-fixture's existing blank-section refusal, so a
        // cut-off section can never be baked into the fixture. Signal the client so it discards
        // the streamed text and raises a section error instead of completing.
        if (stopReason === 'max_tokens') {
          controller.enqueue(new TextEncoder().encode(TRUNCATION_SENTINEL))
          return
        }
        // Post-process: convert placeholder patterns to stable UUID-keyed spans.
        // IDs assigned once here; preserved through parseHTML on all subsequent loads.
        // Kept in parity with src/lib/migratePlaceholders.ts (the client re-runs the
        // same passes on load, so this is defence-in-depth for the persisted format):
        //   1. [PLACEHOLDER: label]        — the instructed format
        //   2. [MULTI WORD ALL CAPS]       — model omits the PLACEHOLDER: prefix
        //   3. [Title Case Fill-in]        — bare capitalised fill-ins e.g. [Company Name];
        //      letters/spaces only + 2+ words so acronyms ([US]) and refs ([Table 1]) are safe
        const processedText = fullText
          .replace(
            /\[PLACEHOLDER:\s*([^\]]+)\]/g,
            (_, raw) => placeholderPatternToSpan(raw, crypto.randomUUID())
          )
          .replace(
            /\[([A-Z][A-Z0-9]*(?:\s+[A-Z][A-Z0-9]*){1,})\]/g,
            (_, raw) => placeholderPatternToSpan(raw, crypto.randomUUID())
          )
          .replace(
            /\[([A-Z][A-Za-z]*(?:\s+[A-Za-z]+){1,})\]/g,
            (_, raw) => placeholderPatternToSpan(raw, crypto.randomUUID())
          )
        const writeOp = isV2
          ? writeSectionById(supabase, sectionId, processedText)
          : writeSection(supabase, proposalId, sectionId, orgId, processedText)
        try {
          await writeOp
          const { error: usageErr } = await supabase.from('usage_events').insert({
            event_type: 'ai_section_call',
            org_id: orgId,
            user_id: user?.id ?? null,
            proposal_id: proposalId ?? null,
            metadata: { section_id: sectionId, section_name: sectionName },
          })
          if (usageErr) console.error('[generate-proposal-section] usage_events insert error:', usageErr)
        } catch (err) {
          console.error('[generate-proposal-section] flush write error:', err)
        }
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
