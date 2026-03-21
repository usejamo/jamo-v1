// scripts/ingest.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { embedBatch } from './ingest-regulatory'

const EMBED_BATCH_SIZE = 100

// Build a mock OpenAI client that returns fake 1536-dim embeddings
function makeMockOpenAI(dims = 1536) {
  return {
    embeddings: {
      create: vi.fn(async ({ input }: { input: string[] }) => ({
        data: input.map((_: string, i: number) => ({
          embedding: Array(dims).fill(0.1),
          index: i,
        })),
      })),
    },
  }
}

describe('embedBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns embeddings with 1536 dimensions per chunk', async () => {
    const mockOpenAI = makeMockOpenAI(1536)
    const texts = ['chunk one', 'chunk two', 'chunk three']
    const result = await embedBatch(texts, mockOpenAI as never)
    expect(result).toHaveLength(3)
    for (const embedding of result) {
      expect(embedding).toHaveLength(1536)
    }
  })

  it('batches requests at EMBED_BATCH_SIZE chunks per call', async () => {
    const mockOpenAI = makeMockOpenAI(1536)
    // Create EMBED_BATCH_SIZE + 10 texts — should trigger 2 API calls
    const texts = Array(EMBED_BATCH_SIZE + 10).fill('regulatory text chunk')
    const result = await embedBatch(texts, mockOpenAI as never)
    expect(result).toHaveLength(texts.length)
    // embeddings.create should have been called twice (batch 1: 100, batch 2: 10)
    expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(2)
  })

  it('throws when returned embedding dimension is not 1536', async () => {
    const mockOpenAI = makeMockOpenAI(512) // wrong dims
    const texts = ['chunk one']
    await expect(embedBatch(texts, mockOpenAI as never)).rejects.toThrow(
      /dimension/i
    )
  })
})
