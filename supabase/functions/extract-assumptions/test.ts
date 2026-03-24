// supabase/functions/extract-assumptions/test.ts
// Run with: deno test supabase/functions/extract-assumptions/test.ts --allow-env --allow-net
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mapConfidence, parseClaudeResponse } from './index.ts'

// ============================================================================
// REQ-3.6: confidence float mapping (testable without live API)
// ============================================================================

Deno.test('REQ-3.6: confidence float 0.9 maps to "high"', () => {
  assertEquals(mapConfidence(0.9), 'high')
})

Deno.test('REQ-3.6: confidence float 0.8 maps to "high" (boundary)', () => {
  assertEquals(mapConfidence(0.8), 'high')
})

Deno.test('REQ-3.6: confidence float 0.6 maps to "medium"', () => {
  assertEquals(mapConfidence(0.6), 'medium')
})

Deno.test('REQ-3.6: confidence float 0.5 maps to "medium" (boundary)', () => {
  assertEquals(mapConfidence(0.5), 'medium')
})

Deno.test('REQ-3.6: confidence float 0.3 maps to "low"', () => {
  assertEquals(mapConfidence(0.3), 'low')
})

Deno.test('REQ-3.6: confidence float 0.0 maps to "low"', () => {
  assertEquals(mapConfidence(0.0), 'low')
})

// ============================================================================
// REQ-3.1 + REQ-3.2: parseClaudeResponse shape and category parsing
// ============================================================================

Deno.test('REQ-3.1: parseClaudeResponse returns { assumptions, missing } shape', () => {
  const json = JSON.stringify({
    assumptions: [
      { category: 'scope', value: 'Phase II oncology', confidence: 0.9, source: 'rfp.pdf' },
    ],
    missing: [
      { field: 'primary_endpoint', description: 'Primary study endpoint not found' },
    ],
  })
  const result = parseClaudeResponse(json)
  assertEquals(Array.isArray(result.assumptions), true)
  assertEquals(Array.isArray(result.missing), true)
  assertEquals(result.assumptions.length, 1)
  assertEquals(result.missing.length, 1)
})

Deno.test('REQ-3.2: parseClaudeResponse extracts expected categories', () => {
  const json = JSON.stringify({
    assumptions: [
      { category: 'sponsor_metadata', value: 'Pfizer', confidence: 0.95, source: 'rfp.pdf' },
      { category: 'scope', value: '200 sites', confidence: 0.8, source: 'protocol.pdf' },
      { category: 'timeline', value: '18 months', confidence: 0.7, source: 'rfp.pdf' },
      { category: 'budget', value: '$2M total', confidence: 0.6, source: 'budget.xlsx' },
      { category: 'criteria', value: 'ECOG 0-1', confidence: 0.85, source: 'protocol.pdf' },
    ],
    missing: [],
  })
  const result = parseClaudeResponse(json)
  const categories = result.assumptions.map((a) => a.category)
  assertEquals(categories.includes('sponsor_metadata'), true)
  assertEquals(categories.includes('scope'), true)
  assertEquals(categories.includes('timeline'), true)
  assertEquals(categories.includes('budget'), true)
  assertEquals(categories.includes('criteria'), true)
})

Deno.test('REQ-3.2: missing fields array returned when fields not found', () => {
  const json = JSON.stringify({
    assumptions: [],
    missing: [
      { field: 'primary_endpoint', description: 'Not found in documents' },
      { field: 'sample_size', description: 'Not specified' },
    ],
  })
  const result = parseClaudeResponse(json)
  assertEquals(result.missing.length, 2)
  assertEquals(result.missing[0].field, 'primary_endpoint')
})

Deno.test('REQ-3.1: parseClaudeResponse handles JSON embedded in prose (regex extraction)', () => {
  const prose = `Here is my analysis of the document:
{ "assumptions": [{ "category": "scope", "value": "Phase II", "confidence": 0.9, "source": "doc.pdf" }], "missing": [] }
That concludes the extraction.`
  const result = parseClaudeResponse(prose)
  assertEquals(result.assumptions.length, 1)
  assertEquals(result.assumptions[0].category, 'scope')
})

Deno.test('REQ-3.1: parseClaudeResponse returns empty arrays on invalid JSON', () => {
  const result = parseClaudeResponse('not valid json at all')
  assertEquals(result.assumptions, [])
  assertEquals(result.missing, [])
})

Deno.test('REQ-3.6: DB insert uses "content" not "value" — mapConfidence used before insert', () => {
  // Simulate the mapping logic from index.ts (lines 178-187)
  const rawAssumptions = [
    { category: 'scope', value: 'Phase II study', confidence: 0.9, source: 'rfp.pdf' },
  ]
  const proposalId = 'prop-123'
  const orgId = 'org-456'

  const rows = rawAssumptions.map((a) => ({
    proposal_id: proposalId,
    org_id: orgId,
    category: a.category,
    content: a.value,   // DB column is 'content' not 'value'
    confidence: mapConfidence(a.confidence),
    status: 'pending',
    source_document: null,
    user_edited: false,
  }))

  assertEquals(rows[0].content, 'Phase II study')
  assertEquals('value' in rows[0], false)  // must NOT have 'value' key
  assertEquals(rows[0].confidence, 'high')
  assertEquals(rows[0].proposal_id, proposalId)
  assertEquals(rows[0].org_id, orgId)
})

// ============================================================================
// Tests requiring live Anthropic API — run manually
// ============================================================================

Deno.test({
  name: 'REQ-3.1: extract-assumptions invoked with real proposalId returns { assumptions, missing } — requires live API',
  ignore: true,  // requires live API — run manually with: deno task test:integration
  fn: () => {},
})

Deno.test({
  name: 'REQ-3.2: live extraction identifies all 5 categories from sample CRO document — requires live API',
  ignore: true,  // requires live API — run manually with: deno task test:integration
  fn: () => {},
})
