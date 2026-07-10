import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { extractPDF, extractDOCX, extractXLSX, extractTXT, classifyDocument } from "./index.ts"

Deno.test("PDF extraction works", async () => {
  const fileData = await Deno.readFile("./fixtures/test-rfp.pdf")
  const result = await extractPDF(fileData)
  assertExists(result.text)
  assertEquals(result.pageCount > 0, true)
})

Deno.test("DOCX extraction works", async () => {
  const fileData = await Deno.readFile("./fixtures/test-protocol.docx")
  const buffer = fileData.buffer
  const text = await extractDOCX(buffer)
  assertExists(text)
})

Deno.test("XLSX extraction works", async () => {
  const fileData = await Deno.readFile("./fixtures/test-budget.xlsx")
  const buffer = fileData.buffer
  const text = await extractXLSX(buffer)
  assertExists(text)
})

Deno.test("TXT extraction works", () => {
  const text = "Hello World"
  const buffer = new TextEncoder().encode(text).buffer
  const extracted = extractTXT(buffer)
  assertEquals(extracted, text)
})

Deno.test("Document classification works", () => {
  assertEquals(classifyDocument("rfp-jan-2025.pdf", ""), "rfp")
  assertEquals(classifyDocument("study-protocol.docx", ""), "protocol")
  assertEquals(classifyDocument("meeting-transcript.txt", ""), "transcript")
  assertEquals(classifyDocument("budget-2025.xlsx", ""), "budget")
  assertEquals(classifyDocument("unknown.pdf", "proposal deadline here"), "rfp")
  assertEquals(classifyDocument("unknown.pdf", "inclusion criteria"), "protocol")
  assertEquals(classifyDocument("random.pdf", ""), "other")
})

// ============================================================================
// REQ-2 (14.7-04): proposal_id written on every inserted proposal chunk at ingest
// ============================================================================

Deno.test({
  name: 'extract-document: chunkAndEmbedProposal writes proposal_id = params.proposalId on every inserted chunk row (null-safe when the document has no proposal_id) — INTEGRATION, live-only, see 14.7-07',
  ignore: true,
  fn() {
    // chunkAndEmbedProposal is not exported (calls OpenAI + Supabase directly) —
    // requires OPENAI_API_KEY + a live Supabase project to exercise end-to-end.
    // Static verification (this plan): the `rows` map includes
    // `proposal_id: params.proposalId`, and the call site passes
    // `proposalId: doc.proposal_id ?? null` (doc already fetched via select('*'),
    // no new query). Live-verified in 14.7-07: upload+extract a doc to a known
    // proposal → its chunks have proposal_id = that proposal; a doc with no
    // proposal_id writes chunks with proposal_id null (does not throw).
  },
})
