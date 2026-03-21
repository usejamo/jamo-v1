// src/lib/retrieval.test.ts
import { describe, it, expect } from 'vitest'
import {
  mergeHybridResults,
  buildSystemPromptBlock,
  type VectorResult,
  type TextResult,
  type MergedResult,
} from './retrieval'

describe('mergeHybridResults', () => {
  it('weights vector results at 70% and text results at 30%', () => {
    const vectorResults: VectorResult[] = [
      { id: 'a', content: 'content a', source: 'src', doc_type: 'regulatory', vector_score: 0.9 }
    ]
    const textResults: TextResult[] = [
      { id: 'a', content: 'content a', source: 'src', doc_type: 'regulatory', text_score: 0.8 }
    ]
    const result = mergeHybridResults(vectorResults, textResults, 5)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
    expect(result[0].final_score).toBeCloseTo(0.7 * 0.9 + 0.3 * 0.8, 5)
  })

  it('deduplicates chunks appearing in both result sets', () => {
    const vectorResults: VectorResult[] = [
      { id: 'a', content: 'content a', source: 'src', doc_type: 'regulatory', vector_score: 0.9 },
      { id: 'b', content: 'content b', source: 'src', doc_type: 'regulatory', vector_score: 0.7 },
    ]
    const textResults: TextResult[] = [
      { id: 'a', content: 'content a', source: 'src', doc_type: 'regulatory', text_score: 0.8 },
      { id: 'c', content: 'content c', source: 'src', doc_type: 'regulatory', text_score: 0.6 },
    ]
    const result = mergeHybridResults(vectorResults, textResults, 10)
    // Should have 3 unique items: a, b, c
    expect(result).toHaveLength(3)
    const ids = result.map(r => r.id).sort()
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('returns at most k results', () => {
    const vectorResults: VectorResult[] = [
      { id: 'a', content: 'a', source: 'src', doc_type: 'regulatory', vector_score: 0.9 },
      { id: 'b', content: 'b', source: 'src', doc_type: 'regulatory', vector_score: 0.8 },
      { id: 'c', content: 'c', source: 'src', doc_type: 'regulatory', vector_score: 0.7 },
    ]
    const textResults: TextResult[] = []
    const result = mergeHybridResults(vectorResults, textResults, 2)
    expect(result).toHaveLength(2)
    // Should be sorted by final_score descending
    expect(result[0].final_score).toBeGreaterThanOrEqual(result[1].final_score)
  })

  it('handles empty vector or text result sets gracefully', () => {
    const vectorResults: VectorResult[] = [
      { id: 'x', content: 'content x', source: 'src', doc_type: 'regulatory', vector_score: 0.75 }
    ]
    const resultVectorOnly = mergeHybridResults(vectorResults, [], 5)
    expect(resultVectorOnly).toHaveLength(1)
    expect(resultVectorOnly[0].final_score).toBeCloseTo(0.7 * 0.75, 5)

    const textResults: TextResult[] = [
      { id: 'y', content: 'content y', source: 'src', doc_type: 'regulatory', text_score: 0.6 }
    ]
    const resultTextOnly = mergeHybridResults([], textResults, 5)
    expect(resultTextOnly).toHaveLength(1)
    expect(resultTextOnly[0].final_score).toBeCloseTo(0.3 * 0.6, 5)
  })
})

describe('buildSystemPromptBlock', () => {
  it('returns fallback text when arrays are empty', () => {
    const block = buildSystemPromptBlock([], [])
    expect(block).toContain('(No relevant regulatory context found)')
    expect(block).toContain('(No relevant proposal history found)')
  })

  it('starts with [REGULATORY CONTEXT] and contains [PROPOSAL HISTORY] and [INSTRUCTIONS]', () => {
    const regChunks: MergedResult[] = [
      { id: 'r1', content: 'ICH E6 GCP guidance text', source: 'ICH E6', doc_type: 'regulatory', final_score: 0.9 }
    ]
    const propChunks: MergedResult[] = [
      { id: 'p1', content: 'Previous proposal section', source: 'Proposal 2024', doc_type: 'proposal', final_score: 0.8 }
    ]
    const block = buildSystemPromptBlock(regChunks, propChunks)
    expect(block.startsWith('[REGULATORY CONTEXT]')).toBe(true)
    expect(block).toContain('[PROPOSAL HISTORY]')
    expect(block).toContain('[INSTRUCTIONS]')
    expect(block).toContain('[ICH E6]')
    expect(block).toContain('[Proposal 2024]')
  })
})
