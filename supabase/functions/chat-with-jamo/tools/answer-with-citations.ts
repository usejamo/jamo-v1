import type { Tool } from "npm:@anthropic-ai/sdk/resources/messages"

export interface CitationInput {
  source: string
  passage: string
  chunk_id: string
}

export interface AnswerWithCitationsInput {
  answer: string
  citations: CitationInput[]
}

export const answerWithCitationsTool: Tool = {
  name: "answer_with_citations",
  description: "Answer a question about the proposal documents or regulatory guidelines. Include citations for every claim. Only cite passages that are verbatim (or near-verbatim) from the retrieved context — never fabricate source references.",
  input_schema: {
    type: "object" as const,
    properties: {
      answer: { type: "string", description: "The answer to the user's question" },
      citations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string", description: "Document name (e.g. 'ICH E6(R3) §5.1')" },
            passage: { type: "string", description: "Short verbatim quote from the source" },
            chunk_id: { type: "string", description: "ID of the retrieved chunk this citation comes from" },
          },
          required: ["source", "passage", "chunk_id"],
        },
      },
    },
    required: ["answer", "citations"],
  },
}

export function handleAnswerWithCitations(input: AnswerWithCitationsInput, retrievedChunkIds: Set<string>) {
  // Guardrail: strip citations whose chunk_id was not in the retrieved context
  const validCitations = input.citations.filter((c) => retrievedChunkIds.has(c.chunk_id))
  const fabricatedCount = input.citations.length - validCitations.length
  const result: { answer: string; citations: Array<{source: string; passage: string; chunkId: string}>; warning?: string } = {
    answer: input.answer,
    citations: validCitations.map((c) => ({ source: c.source, passage: c.passage, chunkId: c.chunk_id })),
  }
  if (fabricatedCount > 0) {
    result.warning = `${fabricatedCount} citation(s) removed — source not found in retrieved documents`
  }
  return result
}
