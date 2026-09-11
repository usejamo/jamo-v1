// RAG context fetching with per-tool K values

export interface RagKConfig {
  regulatory: number
  proposal: number
}

export const RAG_K: Record<string, RagKConfig> = {
  propose_edit:                { regulatory: 5, proposal: 5 },
  answer_with_citations:       { regulatory: 5, proposal: 5 },
  check_regulatory_compliance: { regulatory: 5, proposal: 2 },
  ask_user:                    { regulatory: 0, proposal: 0 },
  set_focus:                   { regulatory: 0, proposal: 0 },
}

export const DEFAULT_RAG_K: RagKConfig = { regulatory: 5, proposal: 5 }

export interface RagContext {
  regulatoryChunks: Array<{ id: string; content: string; source: string }>
  proposalChunks: Array<{ id: string; content: string; source: string }>
  retrievedChunkIds: Set<string>
  ragBlock: string
}

export async function fetchRagContext(
  orgId: string,
  query: string,
  kConfig: RagKConfig,
  // Without this, retrieve-context forwards current_proposal_id => NULL into
  // match_chunks_{vector,fts}_proposals, whose eligibility clause reads
  // `c.proposal_id = current_proposal_id OR (p.status <> 'draft' AND ...)`.
  // `= NULL` is never TRUE in SQL, so the own-proposal branch could not fire
  // and the proposal being edited — almost always a draft — was excluded by the
  // second branch too. The chat could not retrieve a single chunk from the
  // proposal in front of the user. The generation path always passed it.
  proposalId?: string
): Promise<RagContext> {
  if (kConfig.regulatory === 0 && kConfig.proposal === 0) {
    return { regulatoryChunks: [], proposalChunks: [], retrievedChunkIds: new Set(), ragBlock: "" }
  }

  try {
    const ragRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/retrieve-context`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          orgId,
          query,
          k_regulatory: kConfig.regulatory,
          k_proposal: kConfig.proposal,
          ...(proposalId ? { proposalId } : {}),
        }),
      }
    )
    if (!ragRes.ok) {
      return { regulatoryChunks: [], proposalChunks: [], retrievedChunkIds: new Set(), ragBlock: "" }
    }
    const ragData = await ragRes.json()
    const regulatoryChunks = ragData.regulatoryChunks ?? []
    const proposalChunks = ragData.proposalChunks ?? []
    const allChunks = [...regulatoryChunks, ...proposalChunks]
    const retrievedChunkIds = new Set<string>(allChunks.map((c: { id: string }) => c.id))

    // Build context block for system prompt injection
    const regSection = regulatoryChunks.length > 0
      ? regulatoryChunks.map((c: { source: string; content: string }) => `[${c.source}] ${c.content}`).join("\n\n")
      : "(No relevant regulatory context found)"
    const propSection = proposalChunks.length > 0
      ? proposalChunks.map((c: { source: string; content: string }) => `[${c.source}] ${c.content}`).join("\n\n")
      : "(No relevant proposal history found)"
    const ragBlock = `[REGULATORY CONTEXT]\n${regSection}\n\n[PROPOSAL HISTORY]\n${propSection}`

    return { regulatoryChunks, proposalChunks, retrievedChunkIds, ragBlock }
  } catch {
    return { regulatoryChunks: [], proposalChunks: [], retrievedChunkIds: new Set(), ragBlock: "" }
  }
}

/**
 * Render the proposal's approved assumptions for the chat system prompt.
 *
 * Chat previously received no assumptions in any form — buildContextPayload
 * sends sections and history only, and this function never queried them. The
 * user could not ask about the assumptions they had just reviewed.
 *
 * Deliberately APPROVED-only and fetched server-side: rejected and pending
 * assumptions must not reach the model as though they were live, and body-
 * supplied context is what 14.3 moved away from trusting. The line shape
 * matches generate-proposal-section's promptAssembly so the model sees
 * assumptions identically whether generating or chatting.
 */
export function buildAssumptionsBlock(
  assumptions: Array<{ category: string; content: string }>
): string {
  const lines = assumptions
    .filter((a) => (a.content ?? "").trim().length > 0)
    .map((a) => `- [${a.category}] ${a.content.trim()}`)
  if (lines.length === 0) return ""
  return `[APPROVED ASSUMPTIONS]\n${lines.join("\n")}`
}
