import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'

// ============================================================================
// EXTRACTION HANDLER FUNCTIONS (exported for testability)
// ============================================================================

export async function extractPDF(data: Uint8Array): Promise<{ text: string, pageCount: number }> {
  const { getDocument } = await import('pdfjs')
  const document = await getDocument({ data, useSystemFonts: true }).promise

  const pages: string[] = []
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(' ')
    pages.push(pageText)
  }

  return {
    text: pages.join('\n\n'),
    pageCount: document.numPages
  }
}

export async function extractDOCX(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function extractXLSX(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })

  // Extract all sheets as CSV
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`
  })

  return sheets.join('\n\n')
}

export function extractTXT(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer)
}

export function classifyDocument(filename: string, content: string): string {
  const lower = filename.toLowerCase()

  // Filename-based classification (primary)
  if (lower.includes('rfp') || lower.includes('request for proposal')) return 'rfp'
  if (lower.includes('protocol')) return 'protocol'
  if (lower.includes('transcript') || lower.includes('notes') || lower.includes('meeting')) return 'transcript'
  if (lower.includes('budget') || lower.includes('cost') || lower.includes('pricing')) return 'budget'
  if (lower.includes('template') || lower.includes('brochure')) return 'template'

  // Content-based classification (fallback)
  const contentLower = content.toLowerCase()
  if (contentLower.includes('proposal deadline') || contentLower.includes('evaluation criteria')) return 'rfp'
  if (contentLower.includes('inclusion criteria') || contentLower.includes('study design')) return 'protocol'

  return 'other'
}

// ============================================================================
// EDGE FUNCTION REQUEST HANDLER
// ============================================================================

interface ExtractRequest {
  documentId: string  // UUID of row in proposal_documents
}

serve(async (req) => {
  // CORS handling
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Parse request
    const { documentId } = await req.json() as ExtractRequest

    // 2. Create Supabase client using service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 3. Fetch document metadata
    const { data: doc, error: fetchError } = await supabase
      .from('proposal_documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (fetchError || !doc) {
      throw new Error(`Document not found: ${documentId}`)
    }

    // 4. Update status to 'extracting'
    await supabase
      .from('proposal_documents')
      .update({ parse_status: 'extracting' })
      .eq('id', documentId)

    // 5. Download file from Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.storage_path)

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`)
    }

    const buffer = await fileData.arrayBuffer()

    // 6. Route to extraction handler based on mime_type
    let extractedText = ''
    let pageCount = 0

    if (doc.mime_type === 'application/pdf') {
      const result = await extractPDF(new Uint8Array(buffer))
      extractedText = result.text
      pageCount = result.pageCount
    } else if (doc.mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || doc.mime_type === 'application/msword') {
      extractedText = await extractDOCX(buffer)
    } else if (doc.mime_type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || doc.mime_type === 'application/vnd.ms-excel') {
      extractedText = await extractXLSX(buffer)
    } else if (doc.mime_type === 'text/plain') {
      extractedText = extractTXT(buffer)
    } else {
      throw new Error(`Unsupported file type: ${doc.mime_type}`)
    }

    // 7. Classify document type
    const docType = classifyDocument(doc.name || '', extractedText)

    // 8. Calculate word count
    const wordCount = extractedText.split(/\s+/).filter(w => w.length > 0).length

    // 9. Insert into document_extracts
    await supabase.from('document_extracts').insert({
      document_id: documentId,
      org_id: doc.org_id,
      content: extractedText,
      page_count: pageCount || null,
      word_count: wordCount
    })

    // 10. Update proposal_documents with parse_status='complete' and doc_type
    await supabase
      .from('proposal_documents')
      .update({
        parse_status: 'complete',
        doc_type: docType
      })
      .eq('id', documentId)

    // 11. Return success response
    return new Response(JSON.stringify({
      success: true,
      documentId,
      extractedLength: extractedText.length,
      wordCount,
      pageCount,
      docType
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    // Error handling: update parse_status to 'error' and store error message
    let documentId: string | null = null
    let orgId: string | null = null

    try {
      const body = await req.clone().json()
      documentId = body.documentId
    } catch {
      // Could not parse request body
    }

    if (documentId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // Try to get org_id from the document
        const { data: doc } = await supabase
          .from('proposal_documents')
          .select('org_id')
          .eq('id', documentId)
          .single()

        if (doc) {
          orgId = doc.org_id
        }

        // Update parse_status to error
        await supabase
          .from('proposal_documents')
          .update({ parse_status: 'error' })
          .eq('id', documentId)

        // Insert error record into document_extracts
        if (orgId) {
          await supabase.from('document_extracts').insert({
            document_id: documentId,
            org_id: orgId,
            content: '',
            parse_error: error.message
          })
        }
      } catch (dbError) {
        // Ignore database errors during error handling
        console.error('Failed to update error status:', dbError)
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
