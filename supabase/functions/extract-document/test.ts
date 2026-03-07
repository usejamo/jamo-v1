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
