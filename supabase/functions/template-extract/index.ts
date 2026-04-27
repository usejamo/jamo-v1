import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

function parseSectionsFromHtml(html: string): Array<{ name: string; description: string | null }> {
  const results: Array<{ name: string; description: string | null }> = []
  // Split on heading tags to pair headings with following content
  const parts = html.split(/(<h[1-3][^>]*>.*?<\/h[1-3]>)/gi)
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (/<h[1-3][^>]*>/i.test(part)) {
      const name = part.replace(/<[^>]+>/g, '').trim()
      if (!name) continue
      // The next part (if exists) is the content between this heading and the next
      const descRaw = i + 1 < parts.length ? parts[i + 1] : ''
      const desc = descRaw.replace(/<[^>]+>/g, '').trim().slice(0, 300) || null
      results.push({ name, description: desc || null })
    }
  }
  return results
}

function parseSectionsFromText(text: string): Array<{ name: string; description: string | null }> {
  const lines = text.split('\n')
  const results: Array<{ name: string; description: string | null }> = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)
    const isShortNoPunct = trimmed.length < 80 && !/[.!?,;]$/.test(trimmed)
    if (isAllCaps || isShortNoPunct) {
      // Grab following lines as description (up to 3 non-empty lines or 300 chars)
      const descLines: string[] = []
      for (let j = i + 1; j < Math.min(i + 5, lines.length) && descLines.join(' ').length < 300; j++) {
        const next = lines[j].trim()
        if (!next) break
        // Stop if we hit another heading
        if (next === next.toUpperCase() && /[A-Z]/.test(next) && next.length < 80) break
        descLines.push(next)
      }
      results.push({
        name: trimmed,
        description: descLines.length > 0 ? descLines.join(' ').slice(0, 300) : null
      })
    }
  }
  return results
}

const KNOWN_ROLES = [
  'understanding', 'scope_of_work', 'proposed_team', 'timeline',
  'budget', 'regulatory_strategy', 'quality_management',
  'executive_summary', 'cover_letter'
] as const

async function classifyRoles(
  sections: Array<{ name: string }>,
  anthropicApiKey: string
): Promise<Record<string, string | null>> {
  const sectionList = sections.map((s, i) => `${i + 1}. ${s.name}`).join('\n')
  const prompt = `You are classifying proposal section names into known CRO proposal section types.

Known types: ${KNOWN_ROLES.join(', ')}

For each section name below, return its type from the known list, or "null" if it does not match any known type.
Return ONLY a JSON object mapping section number to type string (or null).
Example: {"1": "understanding", "2": "scope_of_work", "3": null}

Sections:
${sectionList}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!resp.ok) return {}
    const data = await resp.json()
    const text = data?.content?.[0]?.text ?? '{}'
    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return {}
    const parsed = JSON.parse(match[0])
    // Map index (1-based string) to null or valid role
    const result: Record<string, string | null> = {}
    for (const [idx, role] of Object.entries(parsed)) {
      const sectionIdx = parseInt(idx, 10) - 1
      if (sectionIdx >= 0 && sectionIdx < sections.length) {
        const sectionName = sections[sectionIdx].name
        result[sectionName] = (KNOWN_ROLES as readonly string[]).includes(role as string)
          ? (role as string)
          : null
      }
    }
    return result
  } catch {
    return {}
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  let templateId: string | undefined

  try {
    const body = await req.json()
    templateId = body.templateId

    // 1. Validate
    if (!templateId || !isValidUUID(templateId)) {
      return new Response(JSON.stringify({ error: 'Invalid templateId' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // 2. Fetch template row
    const { data: template, error: fetchError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (fetchError || !template) {
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!template.file_path) {
      return new Response(JSON.stringify({ error: 'Template has no file_path' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // 3. Update status to extracting
    await supabase
      .from('templates')
      .update({ parse_status: 'extracting' })
      .eq('id', templateId)

    // 4. Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(template.file_path)

    if (downloadError || !fileData) {
      throw new Error(`Storage download failed: ${downloadError?.message}`)
    }

    // 5. Determine file type
    const ext = template.file_path.split('.').pop()?.toLowerCase()

    let sections: Array<{ name: string; description: string | null }> = []
    let wordCount = 0

    if (ext === 'docx') {
      // Use mammoth.convertToHtml to detect headings
      const mammoth = await import('https://esm.sh/mammoth@1.6.0')
      const buffer = await fileData.arrayBuffer()
      const result = await mammoth.convertToHtml({ buffer })
      const html = result.value
      sections = parseSectionsFromHtml(html)
      // Estimate word count from plain text
      const text = html.replace(/<[^>]+>/g, ' ')
      wordCount = text.trim().split(/\s+/).length
    } else {
      // PDF: extract text and use heading heuristic
      const { getDocument } = await import('https://esm.sh/pdfjs-dist@3.11.174/build/pdf.min.mjs')
      const buffer = await fileData.arrayBuffer()
      const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
      const textParts: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        textParts.push(content.items.map((item: { str?: string }) => item.str ?? '').join(' '))
      }
      const fullText = textParts.join('\n')
      wordCount = fullText.trim().split(/\s+/).length
      sections = parseSectionsFromText(fullText)
    }

    // 6. LLM role classification via Claude Haiku
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const roleMap = anthropicApiKey && sections.length > 0
      ? await classifyRoles(sections, anthropicApiKey)
      : {}

    // 7. Low-confidence detection
    const isLowConfidence = sections.length < 3 || wordCount < 200

    // 8. Bulk-insert template_sections
    if (sections.length > 0) {
      const sectionInserts = sections.map((s, idx) => ({
        template_id: templateId,
        org_id: template.org_id,
        name: s.name,
        description: s.description,
        role: roleMap[s.name] ?? null,
        position: idx + 1,
      }))

      const { error: insertError } = await supabase
        .from('template_sections')
        .insert(sectionInserts)

      if (insertError) throw new Error(`Section insert failed: ${insertError.message}`)
    }

    // 9. Update template to ready
    await supabase
      .from('templates')
      .update({ parse_status: 'ready', low_confidence: isLowConfidence })
      .eq('id', templateId)

    return new Response(
      JSON.stringify({ success: true, sectionCount: sections.length }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    // On error, update parse_status to 'error'
    if (templateId && isValidUUID(templateId)) {
      await supabase
        .from('templates')
        .update({ parse_status: 'error' })
        .eq('id', templateId)
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Extraction failed' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
