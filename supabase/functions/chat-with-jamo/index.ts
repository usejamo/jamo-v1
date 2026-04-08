import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Intent detection (D-15) — keyword matching, no AI call needed for clear cases
const RAG_KEYWORDS = ['protocol', 'rfp', 'sow', 'according to', 'based on', 'what does the']
const EXPLAIN_KEYWORDS = ['explain', 'where did this', 'source', 'citation', 'where does']
const EDIT_KEYWORDS = ['expand', 'condense', 'rewrite', 'add ', 'remove', 'change', 'make it', 'make me', 'write me', 'write a', 'draft', 'shorten', 'update', 'create', 'generate']

function detectIntent(message: string, intentHint?: string | null): 'rag' | 'explain' | 'edit' | 'general' {
  if (intentHint && ['rag', 'explain', 'edit', 'general'].includes(intentHint)) {
    return intentHint as 'rag' | 'explain' | 'edit' | 'general'
  }
  const lower = message.toLowerCase()
  if (EXPLAIN_KEYWORDS.some(k => lower.includes(k))) return 'explain'
  if (RAG_KEYWORDS.some(k => lower.includes(k))) return 'rag'
  if (EDIT_KEYWORDS.some(k => lower.includes(k))) return 'edit'
  return 'general'
}

// System prompt assembly (per D-12, D-13, D-16)
function buildSystemPrompt(
  targetSection: { key: string; title: string; content: string },
  otherSections: Array<{ key: string; title: string; summary: string }>,
  ragBlock: string | null,
  intent: string
): string {
  const lines: string[] = [
    'You are Jamo, an expert AI assistant for CRO (Contract Research Organization) proposal writing.',
    'You help CRO staff write and refine clinical trial proposals that are accurate, compliant, and persuasive.',
    '',
    `[TARGET SECTION: ${targetSection.title}]`,
    targetSection.content || '(empty)',
    '',
    '[OTHER PROPOSAL SECTIONS — summaries only]',
    ...otherSections.map(s => `${s.title}: ${s.summary || '(empty)'}`),
  ]

  if (ragBlock) {
    lines.push('', ragBlock)
  }

  lines.push('')
  if (intent === 'edit') {
    lines.push('[INSTRUCTIONS] The user wants to edit the target section. Output the revised section as raw HTML only. Do NOT include any preamble, explanation, section title announcement, or markdown code fences (no ```html or ```). Start your response directly with the first HTML tag (e.g. <p> or <h2>). End with the last closing HTML tag.')
  } else if (intent === 'explain') {
    lines.push('[INSTRUCTIONS] The user wants to understand where the section content came from. Trace content back to source documents when possible. Include inline citations in format: (Source: <document name>, <section/chunk>). Keep your response concise — 2-4 sentences plus citations.')
  } else if (intent === 'rag') {
    lines.push('[INSTRUCTIONS] Answer the user\'s question using the regulatory context and proposal history provided above. Cite sources inline.')
  } else {
    lines.push('[INSTRUCTIONS] Respond conversationally. Help the user improve this section of their CRO proposal. Be direct and specific.')
  }

  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      proposal_id,
      org_id,
      user_message,
      target_section,
      other_sections = [],
      chat_history = [],
      intent_hint = null,
    } = body

    if (!user_message || !target_section) {
      return new Response(JSON.stringify({ error: 'user_message and target_section are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const intent = detectIntent(user_message, intent_hint)

    // RAG sub-fetch (D-15) — only for rag/explain intents to avoid timeout
    let ragBlock: string | null = null
    if ((intent === 'rag' || intent === 'explain') && org_id) {
      try {
        const ragRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/retrieve-context`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ orgId: org_id, query: user_message }),
          }
        )
        if (ragRes.ok) {
          const ragData = await ragRes.json()
          ragBlock = ragData.systemPromptBlock ?? null
        }
      } catch {
        // RAG failure is non-blocking — proceed without it
      }
    }

    const systemPrompt = buildSystemPrompt(target_section, other_sections, ragBlock, intent)
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '' })

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        ...chat_history.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: user_message },
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        // Send intent as first metadata event so client knows how to render
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'intent', intent })}\n\n`))
        for await (const event of stream) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
