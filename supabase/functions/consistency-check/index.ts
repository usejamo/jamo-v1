import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

interface SectionInput {
  section_key: string
  content: string
}

interface ConsistencyFlagRaw {
  message: string
  sections_involved: string[]
}

interface ConsistencyCheckRequest {
  sections: SectionInput[]
}

interface ConsistencyCheckResponse {
  flags: ConsistencyFlagRaw[]
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function parseConsistencyResponse(text: string): ConsistencyFlagRaw[] {
  const trimmed = text.trim()
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const normalized = stripped.replace(/\r?\n/g, ' ').replace(/\t/g, ' ')

  try {
    const parsed = JSON.parse(normalized)
    return Array.isArray(parsed.flags) ? parsed.flags : []
  } catch {
    // Fallback: find first balanced JSON object
    try {
      const start = normalized.indexOf('{')
      if (start === -1) return []
      let depth = 0
      let end = -1
      for (let i = start; i < normalized.length; i++) {
        if (normalized[i] === '{') depth++
        else if (normalized[i] === '}') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end === -1) return []
      const parsed = JSON.parse(normalized.slice(start, end + 1))
      return Array.isArray(parsed.flags) ? parsed.flags : []
    } catch {
      return []
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as ConsistencyCheckRequest
    const { sections } = body

    if (!sections || sections.length < 2) {
      return new Response(
        JSON.stringify({ flags: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userMessage = sections
      .map((s) => `## ${s.section_key}\n${s.content.replace(/<[^>]*>/g, '')}`)
      .join('\n\n')

    const systemPrompt = `You are a CRO proposal consistency reviewer. Review these proposal sections for cross-section inconsistencies. Check for: budget amounts mentioned in multiple sections that disagree, timeline/milestone dates that conflict, scope descriptions that contradict each other, personnel/staffing numbers that are inconsistent. Return JSON: { "flags": [{ "message": "string describing the inconsistency", "sections_involved": ["section_key1", "section_key2"] }] }. If no inconsistencies found, return { "flags": [] }.`

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
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
    const flags = parseConsistencyResponse(responseText)

    const response: ConsistencyCheckResponse = { flags }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[consistency-check] Error:', error)
    return new Response(JSON.stringify({ error: error.message, flags: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
