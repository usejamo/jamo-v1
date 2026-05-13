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
  kConfig: RagKConfig
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
