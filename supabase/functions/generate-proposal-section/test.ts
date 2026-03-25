<<<<<<< HEAD
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { parseSSEDelta, buildSectionPrompt, writeSection } from './index.ts'

// ============================================================================
// parseSSEDelta tests — pure function, no external deps
// ============================================================================

Deno.test('parseSSEDelta extracts text from content_block_delta events', () => {
  const line = 'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}'
  assertEquals(parseSSEDelta(line), 'hello')
})

Deno.test('parseSSEDelta returns empty string for message_stop event', () => {
  const line = 'data: {"type":"message_stop"}'
  assertEquals(parseSSEDelta(line), '')
})

Deno.test('parseSSEDelta returns empty string for [DONE] sentinel (non-JSON skip)', () => {
  const line = 'data: [DONE]'
  assertEquals(parseSSEDelta(line), '')
})

Deno.test('parseSSEDelta returns empty string for non-data lines', () => {
  assertEquals(parseSSEDelta('event: message_start'), '')
  assertEquals(parseSSEDelta(''), '')
})

Deno.test('parseSSEDelta handles malformed JSON gracefully', () => {
  assertEquals(parseSSEDelta('data: {not valid json'), '')
})

// ============================================================================
// buildSectionPrompt tests — pure function, no external deps
// ============================================================================

Deno.test('buildSectionPrompt includes section name, tone, and anchor in system prompt', () => {
  const { system, userMessage } = buildSectionPrompt({
    sectionId: 'understanding',
    tone: 'formal',
    ragChunks: [{ content: 'ICH E6' }],
    anchor: '',
    proposalInput: { studyInfo: {}, assumptions: [], services: [] },
  })
  assertStringIncludes(system, 'Understanding of the Study')
  assertStringIncludes(system, 'formal')
  assertStringIncludes(userMessage, 'Understanding of the Study')
})

Deno.test('buildSectionPrompt includes RAG context in [REGULATORY CONTEXT] block', () => {
  const { system } = buildSectionPrompt({
    sectionId: 'understanding',
    tone: 'formal',
    ragChunks: [{ content: 'ICH E6' }],
    anchor: '',
    proposalInput: {},
  })
  assertStringIncludes(system, '[REGULATORY CONTEXT]')
  assertStringIncludes(system, 'ICH E6')
})

Deno.test('buildSectionPrompt includes CONSISTENCY ANCHOR block when anchor is non-empty', () => {
  const { system } = buildSectionPrompt({
    sectionId: 'scope_of_work',
    tone: 'formal',
    ragChunks: [],
    anchor: 'Prior sections confirmed 24-month timeline.',
    proposalInput: {},
  })
  assertStringIncludes(system, 'CONSISTENCY ANCHOR')
  assertStringIncludes(system, 'Prior sections confirmed 24-month timeline.')
})

Deno.test('buildSectionPrompt omits CONSISTENCY ANCHOR block when anchor is empty', () => {
  const { system } = buildSectionPrompt({
    sectionId: 'budget',
    tone: 'formal',
    ragChunks: [],
    anchor: '',
    proposalInput: {},
  })
  assertEquals(system.includes('CONSISTENCY ANCHOR'), false)
})

Deno.test('buildSectionPrompt includes [PLACEHOLDER: preservation instruction', () => {
  const { system } = buildSectionPrompt({
    sectionId: 'cover_letter',
    tone: 'formal',
    ragChunks: [],
    anchor: '',
    proposalInput: {},
  })
  assertStringIncludes(system, '[PLACEHOLDER:')
})

Deno.test('buildSectionPrompt omits [REGULATORY CONTEXT] block when ragChunks is empty', () => {
  const { system } = buildSectionPrompt({
    sectionId: 'executive_summary',
    tone: 'persuasive',
    ragChunks: [],
    anchor: '',
    proposalInput: {},
  })
  assertEquals(system.includes('[REGULATORY CONTEXT]'), false)
})

// ============================================================================
// writeSection — requires live DB; kept ignored
// ============================================================================

Deno.test({
  name: 'writeSection upserts to proposal_sections with correct fields',
  ignore: true,
  async fn() {
    // Integration test — run manually with real env vars
    await writeSection(null, 'proposal-id', 'understanding', 'org-id', 'Generated content.')
  },
})

// ============================================================================
// Anchor mode — requires live Anthropic key; kept ignored
// ============================================================================

Deno.test({
  name: 'anchor mode returns JSON with anchor field (non-streaming)',
  ignore: true,
  fn() {
    // Integration test — run manually with real env vars and HTTP request
  },
})
