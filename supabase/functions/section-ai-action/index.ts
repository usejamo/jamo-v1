import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are an expert CRO (Contract Research Organization) proposal writer.
You produce professional, concise, and compelling proposal content.
Output ONLY valid HTML using these tags: <h2>, <h3>, <h4>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
Never use Markdown syntax (no ##, no **, no |---|, no backtick code fences).
Never include preamble, meta-commentary, or any text outside the proposal HTML.
Start your response directly with the first HTML tag.`

function buildPrompt(action: string, sectionKey: string, existingContent: string, userInstructions?: string): string {
  const sectionName = sectionKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  let base: string
  switch (action) {
    case 'expand':
      base = `Expand the following "${sectionName}" section with more detail, supporting evidence, and depth. Keep the same professional tone and structure.\n\n${existingContent}`
      break
    case 'condense':
      base = `Condense the following "${sectionName}" section to be more concise while preserving all key points and professional quality.\n\n${existingContent}`
      break
    case 'rewrite':
      base = `Rewrite the following "${sectionName}" section from scratch. Keep the same topic and intent but use fresh language and structure.\n\n${existingContent}`
      break
    case 'generate':
      base = `Write a professional "${sectionName}" section for a CRO proposal. Be specific, credible, and compelling. Use standard CRO proposal conventions.`
      break
    default:
      base = `Improve the following "${sectionName}" section:\n\n${existingContent}`
  }

  if (userInstructions) {
    base += `\n\nAdditional direction from user: ${userInstructions}`
  }

  return base
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { proposal_id, section_key, action, existing_content, user_instructions } = body

    if (!proposal_id || !section_key || !action) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    })

    const prompt = buildPrompt(action, section_key, existing_content ?? '', user_instructions)

    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
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
    console.error('[section-ai-action] error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
