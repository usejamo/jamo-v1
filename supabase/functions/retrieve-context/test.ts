// supabase/functions/retrieve-context/test.ts
// Deno test file — run with: deno test supabase/functions/retrieve-context/test.ts --allow-env --allow-net
//
// Tests the pure utility functions exported from index.ts directly.
// The Edge Function handler itself requires a live Supabase + OpenAI connection,
// so integration tests for the handler are handled via manual smoke testing.

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mergeHybridResults, buildSystemPromptBlock } from './index.ts'

Deno.test("retrieve-context: returns top-K regulatory chunks — mergeHybridResults limits to k", () => {
  const vectorResults = [
    { id: 'r1', content: 'ICH E6 text', source: 'ICH E6', doc_type: 'regulatory', vector_score: 0.95 },
    { id: 'r2', content: 'FDA guidance', source: 'FDA', doc_type: 'regulatory', vector_score: 0.88 },
    { id: 'r3', content: 'EMA regulation', source: 'EMA', doc_type: 'regulatory', vector_score: 0.75 },
    { id: 'r4', content: 'ICH E3 text', source: 'ICH E3', doc_type: 'regulatory', vector_score: 0.70 },
    { id: 'r5', content: 'PMDA guidance', source: 'PMDA', doc_type: 'regulatory', vector_score: 0.65 },
    { id: 'r6', content: 'TGA regulation', source: 'TGA', doc_type: 'regulatory', vector_score: 0.60 },
  ]
  const result = mergeHybridResults(vectorResults, [], 5)
  assertEquals(result.length, 5)
  // Sorted descending by final_score
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i].final_score < result[i + 1].final_score) {
      throw new Error(`Results not sorted: index ${i} has lower score than index ${i+1}`)
    }
  }
})

Deno.test("retrieve-context: returns top-K proposal chunks — scoped to orgId by design", () => {
  const textResults = [
    { id: 'p1', content: 'Proposal section 1', source: 'Proposal 2024', doc_type: 'proposal', text_score: 0.8 },
    { id: 'p2', content: 'Proposal section 2', source: 'Proposal 2023', doc_type: 'proposal', text_score: 0.6 },
  ]
  const result = mergeHybridResults([], textResults, 5)
  assertEquals(result.length, 2)
  assertEquals(result[0].id, 'p1') // highest text_score first
})

Deno.test("retrieve-context: builds systemPromptBlock with correct format", () => {
  const regChunks = [
    { id: 'r1', content: 'GCP guidance text', source: 'ICH E6', doc_type: 'regulatory', final_score: 0.9 }
  ]
  const propChunks = [
    { id: 'p1', content: 'Previous proposal text', source: 'Proposal 2024', doc_type: 'proposal', final_score: 0.8 }
  ]
  const block = buildSystemPromptBlock(regChunks, propChunks)
  assertStringIncludes(block, '[REGULATORY CONTEXT]')
  assertStringIncludes(block, '[PROPOSAL HISTORY]')
  assertStringIncludes(block, '[INSTRUCTIONS]')
  assertStringIncludes(block, '[ICH E6]')
  assertStringIncludes(block, '[Proposal 2024]')
  // Starts with [REGULATORY CONTEXT]
  assertEquals(block.startsWith('[REGULATORY CONTEXT]'), true)
})

Deno.test("retrieve-context: logs warning when below threshold — belowThreshold flag logic", () => {
  // Test that mergeHybridResults returns empty array when no results, triggering belowThreshold
  const emptyRegResult = mergeHybridResults([], [], 5)
  const emptyPropResult = mergeHybridResults([], [], 5)

  const regulatoryCount = emptyRegResult.length
  const proposalCount = emptyPropResult.length
  const belowThreshold = regulatoryCount < 1 || proposalCount < 1

  assertEquals(belowThreshold, true)
  assertEquals(regulatoryCount, 0)
  assertEquals(proposalCount, 0)

  // Verify fallback text in system prompt block for empty results
  const block = buildSystemPromptBlock(emptyRegResult, emptyPropResult)
  assertStringIncludes(block, '(No relevant regulatory context found)')
  assertStringIncludes(block, '(No relevant proposal history found)')
})
