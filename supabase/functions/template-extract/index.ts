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

function parseSectionsFromHtml(html: string): string[] {
  const matches: string[] = []
  const regex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    // Strip inner HTML tags (e.g. <strong>, <em>)
    const name = match[1].replace(/<[^>]+>/g, '').trim()
    if (name) matches.push(name)
  }
  return matches
}

function parseSectionsFromText(text: string): string[] {
  const lines = text.split('\n')
  const sections: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Heading heuristic: ALL CAPS or short line without trailing punctuation
    const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)
    const isShortNoPunct = trimmed.length < 80 && !/[.!?,;]$/.test(trimmed)
    if (isAllCaps || isShortNoPunct) {
      sections.push(trimmed)
    }
  }
  return sections
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

    let sectionNames: string[] = []
    let wordCount = 0

    if (ext === 'docx') {
      // Use mammoth.convertToHtml to detect headings
      const mammoth = await import('https://esm.sh/mammoth@1.6.0')
      const buffer = await fileData.arrayBuffer()
      const result = await mammoth.convertToHtml({ buffer })
      const html = result.value
      sectionNames = parseSectionsFromHtml(html)
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
      sectionNames = parseSectionsFromText(fullText)
    }

    // 6. Low-confidence detection
    const isLowConfidence = sectionNames.length < 3 || wordCount < 200

    // 7. Bulk-insert template_sections
    if (sectionNames.length > 0) {
      const sectionRows = sectionNames.map((name, i) => ({
        template_id: templateId,
        name,
        role: null,
        description: null,
        position: i + 1,
        org_id: template.org_id,
      }))

      const { error: insertError } = await supabase
        .from('template_sections')
        .insert(sectionRows)

      if (insertError) throw new Error(`Section insert failed: ${insertError.message}`)
    }

    // 8. Update template to ready
    await supabase
      .from('templates')
      .update({ parse_status: 'ready', low_confidence: isLowConfidence })
      .eq('id', templateId)

    return new Response(
      JSON.stringify({ success: true, sectionCount: sectionNames.length }),
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
