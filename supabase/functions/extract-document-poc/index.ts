import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getDocument } from 'pdfjs'

/**
 * Extract text from a PDF using pdfjs-serverless
 * Exported for testing
 */
export async function extractPdfText(pdfBytes: Uint8Array) {
  try {
    const document = await getDocument({
      data: pdfBytes,
      useSystemFonts: true
    }).promise

    const pages: string[] = []
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i)
      const textContent = await page.getTextContent()
      // deno-lint-ignore no-explicit-any
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
      pages.push(pageText)
    }

    const fullText = pages.join('\n\n')

    return {
      success: true,
      text: fullText,
      pageCount: document.numPages,
      wordCount: fullText.split(/\s+/).filter(w => w.length > 0).length,
      message: "pdfjs-serverless import successful"
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }
  }
}

// Only start the server if this module is run directly (not imported for testing)
if (import.meta.main) {
  serve(async (req) => {
    try {
      // Minimal valid PDF with "Hello World" text (base64 encoded)
      const testPdfBase64 = "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUCi9GMSA0OCBUZgoxMCAxMCBUZAooSGVsbG8gV29ybGQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjQgMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAowMDAwMDAwMjQ1IDAwMDAwIG4gCjAwMDAwMDAzMTYgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDYvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgo0MTAKJSVFT0YK"
      const pdfBytes = Uint8Array.from(atob(testPdfBase64), c => c.charCodeAt(0))

      const result = await extractPdfText(pdfBytes)

      if (result.success) {
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        })
      } else {
        return new Response(JSON.stringify(result), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  })
}
