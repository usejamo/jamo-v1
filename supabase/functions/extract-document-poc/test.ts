import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { extractPdfText } from "./index.ts"

Deno.test("POC function imports pdfjs-serverless", async () => {
  // Test that the function handler exists and can be imported
  const module = await import("./index.ts")
  assertExists(module)
  assertExists(module.extractPdfText)
})

Deno.test("POC function extracts text from test PDF", async () => {
  // Minimal valid PDF with "Hello World" text (base64 encoded)
  const testPdfBase64 = "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBvYmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUCi9GMSA0OCBUZgoxMCAxMCBUZAooSGVsbG8gV29ybGQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjQgMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAowMDAwMDAwMjQ1IDAwMDAwIG4gCjAwMDAwMDAzMTYgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDYvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgo0MTAKJSVFT0YK"
  const pdfBytes = Uint8Array.from(atob(testPdfBase64), c => c.charCodeAt(0))

  const result = await extractPdfText(pdfBytes)

  assertExists(result.text)
  assertEquals(result.success, true)
  assertEquals(result.pageCount, 1)
  // "Hello World" should have 2 words
  assertEquals(result.wordCount, 2)
})
