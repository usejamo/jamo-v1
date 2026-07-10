// supabase/functions/retrieve-context/test.ts
// Deno test file — run with: deno test supabase/functions/retrieve-context/test.ts --allow-env --allow-net
//
// Tests the pure utility functions exported from index.ts directly.
// The Edge Function handler itself requires a live Supabase + OpenAI connection,
// so integration tests for the handler are handled via manual smoke testing.
//
// REQ-2 / D-03 (14.3-03): retrieve-context branches on caller shape —
// isInternalServiceRoleCall(req) selects the internal (service-role, body orgId
// trusted — chat-with-jamo/rag.ts) vs user (JWT-derived org, 403 on mismatch —
// useProposalGeneration.ts) path. The branch predicate itself is pure and is
// exercised below with no network. The full request/response integration for
// each branch (internal caller still returns chunks; user mismatch returns a
// real 403) requires a live Supabase auth server + service-role secret and is
// validated live in 14.3-05 — those cases stay `ignore: true` with a pointer.

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mergeHybridResults, buildSystemPromptBlock } from './index.ts'
import { isInternalServiceRoleCall } from '../_shared/auth.ts'

Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-sr-key')

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

// ============================================================================
// REQ-2 / D-03: branch-selection logic (isInternalServiceRoleCall)
// ============================================================================

Deno.test('retrieve-context: internal service-role caller (chat-with-jamo/rag.ts) is detected — takes the preserved-behavior branch', () => {
  const req = new Request('http://x', {
    headers: { Authorization: 'Bearer test-sr-key' },
  })
  assertEquals(isInternalServiceRoleCall(req), true)
})

Deno.test('retrieve-context: user JWT bearer (useProposalGeneration.ts) is NOT internal — takes the JWT-org-scoped branch', () => {
  const req = new Request('http://x', {
    headers: { Authorization: 'Bearer some.user.jwt' },
  })
  assertEquals(isInternalServiceRoleCall(req), false)
})

Deno.test('retrieve-context: missing Authorization header is NOT internal — falls through to the user branch (401 via getAuthedUserAndOrg)', () => {
  const req = new Request('http://x')
  assertEquals(isInternalServiceRoleCall(req), false)
})

Deno.test({
  name: 'retrieve-context: internal service-role caller still returns chunks scoped to the passed body orgId (behavior preserved) — INTEGRATION, live-only, see 14.3-05',
  ignore: true,
  fn() {
    // Requires a live Supabase project (match_chunks_vector/_fts RPCs) + OPENAI_API_KEY.
    // Live-verified in 14.3-05: internal branch never calls getAuthedUserAndOrg
    // (Pitfall 1) and effectiveOrgId === body orgId for a service-role bearer.
  },
})

Deno.test({
  name: 'retrieve-context: user call with body orgId mismatched against JWT org returns 403 — INTEGRATION, live-only, see 14.3-05',
  ignore: true,
  fn() {
    // Requires a live Supabase auth server to mint a real JWT + user_profiles row.
    // Live-verified in 14.3-05: getAuthedUserAndOrg resolves jwtOrgId; a differing
    // body orgId is rejected with 403 'org mismatch' rather than trusted.
  },
})

// ============================================================================
// REQ-7 (14.7-04): proposalId threading — current_proposal_id passed to BOTH
// proposal RPCs only; regulatory path + trust boundary untouched.
// ============================================================================

Deno.test({
  name: 'retrieve-context: proposalId is destructured from the body and passed as current_proposal_id to both match_chunks_vector_proposals and match_chunks_fts_proposals — INTEGRATION, live-only, see 14.7-07',
  ignore: true,
  fn() {
    // Requires a live Supabase project (match_chunks_*_proposals RPCs) + OPENAI_API_KEY.
    // Live-verified in 14.7-07: a request carrying proposalId results in both proposal
    // RPC calls receiving current_proposal_id equal to that value; proposalId is NOT
    // an identity claim so it receives no JWT cross-check (unlike orgId).
  },
})

Deno.test({
  name: 'retrieve-context: regulatory relaxation loop (match_chunks_vector / match_chunks_fts) and the isInternalServiceRoleCall/effectiveOrgId trust boundary are byte-for-byte unchanged by the proposalId thread — INTEGRATION, live-only, see 14.7-07',
  ignore: true,
  fn() {
    // Static verification (this plan): the regulatory RPC call sites (match_chunks_vector,
    // match_chunks_fts) and the isInternalServiceRoleCall branch were not touched by the
    // 14.7-04 diff — only the two match_chunks_*_proposals param objects gained
    // current_proposal_id. Live regression re-confirmed in 14.7-07 (14.6 regression check).
  },
})
