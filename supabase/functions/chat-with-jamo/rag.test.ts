import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRagContext, buildAssumptionsBlock, RAG_K } from './rag.ts'

// ── Why these tests exist ────────────────────────────────────────────────────
//
// The chat sidebar could not retrieve a single chunk from the proposal the user
// was looking at. fetchRagContext posted to retrieve-context WITHOUT a
// proposalId, so retrieve-context forwarded current_proposal_id => NULL into
// match_chunks_{vector,fts}_proposals. Their eligibility clause is:
//
//     c.proposal_id = current_proposal_id                 -- own proposal, any status
//     OR ( p.status <> 'draft' AND ...opted in... )       -- everybody else
//
// `c.proposal_id = NULL` is NULL in SQL, never TRUE, so the own-proposal branch
// could never fire for chat; and the proposal being edited is almost always a
// draft, which the second branch excludes. The generation path passed
// proposalId and worked. Verified against production: with the SAME query and
// org, WITH proposalId returned the proposal's own chunk and WITHOUT returned
// nothing at all.
//
// Assumptions were a separate gap — never sent to chat in any form.

const originalFetch = globalThis.fetch

beforeEach(() => {
  // rag.ts reads Deno.env; stub it for the vitest runner.
  ;(globalThis as any).Deno = {
    env: {
      get: (k: string) =>
        k === 'SUPABASE_URL' ? 'https://proj.supabase.co' : 'service-role-key',
    },
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  delete (globalThis as any).Deno
})

/** Capture the request retrieve-context is called with. */
function captureFetch(responseBody: unknown = { regulatoryChunks: [], proposalChunks: [] }) {
  const calls: Array<{ url: string; body: any }> = []
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return { ok: true, json: async () => responseBody } as any
  }) as any
  return calls
}

describe('fetchRagContext — proposal scoping', () => {
  it('sends proposalId so the current proposal\'s own chunks are eligible', async () => {
    const calls = captureFetch()
    await fetchRagContext('org-1', 'what is the enrollment target', RAG_K.propose_edit, 'prop-42')
    expect(calls).toHaveLength(1)
    expect(calls[0].body.proposalId).toBe('prop-42')
  })

  it('still sends the org and query it always sent', async () => {
    const calls = captureFetch()
    await fetchRagContext('org-1', 'my question', RAG_K.propose_edit, 'prop-42')
    expect(calls[0].body.orgId).toBe('org-1')
    expect(calls[0].body.query).toBe('my question')
    expect(calls[0].body.k_regulatory).toBe(5)
    expect(calls[0].body.k_proposal).toBe(5)
  })

  it('omits proposalId rather than sending a bogus value when there is none', async () => {
    const calls = captureFetch()
    await fetchRagContext('org-1', 'q', RAG_K.propose_edit, undefined)
    expect(calls[0].body.proposalId).toBeUndefined()
  })

  it('does not call retrieve-context at all when both K values are zero', async () => {
    const calls = captureFetch()
    const ctx = await fetchRagContext('org-1', 'q', RAG_K.set_focus, 'prop-42')
    expect(calls).toHaveLength(0)
    expect(ctx.ragBlock).toBe('')
  })

  it('returns an empty context instead of throwing when retrieve-context fails', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as any
    const ctx = await fetchRagContext('org-1', 'q', RAG_K.propose_edit, 'prop-42')
    expect(ctx.proposalChunks).toEqual([])
    expect(ctx.ragBlock).toBe('')
  })
})

describe('buildAssumptionsBlock', () => {
  it('renders assumptions in the same shape generation uses', () => {
    const block = buildAssumptionsBlock([
      { category: 'timeline', content: 'DB lock 6 weeks after LPLV' },
      { category: 'budget', content: 'Pass-through costs excluded' },
    ])
    expect(block).toContain('[APPROVED ASSUMPTIONS]')
    expect(block).toContain('- [timeline] DB lock 6 weeks after LPLV')
    expect(block).toContain('- [budget] Pass-through costs excluded')
  })

  it('returns an empty string when there are none, so no empty heading is injected', () => {
    expect(buildAssumptionsBlock([])).toBe('')
  })

  it('says plainly that none are approved when given only blank content', () => {
    // Defensive: blank rows should not become bare "- [scope] " prompt lines.
    const block = buildAssumptionsBlock([{ category: 'scope', content: '   ' }])
    expect(block).toBe('')
  })
})
