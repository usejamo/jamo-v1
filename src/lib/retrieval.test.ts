// src/lib/retrieval.test.ts
import { describe, it, expect } from 'vitest'
import {
  mergeHybridResults,
  buildSystemPromptBlock,
  type MergedResult,
} from './retrieval'

describe('mergeHybridResults — Reciprocal Rank Fusion', () => {
  // The previous merge was `0.7 * vector_score + 0.3 * text_score`. That looked
  // like a 70/30 blend but was not one: cosine similarity lands around 0.4-0.7
  // while ts_rank lands around 0.01-0.1, so the text arm contributed roughly 2%
  // of the final score. The blend was effectively vector-only.
  //
  // RRF fuses by RANK POSITION, not score, so the two arms are comparable no
  // matter how differently they are scaled: score = sum of 1/(K + rank).
  const K = 60

  it('fuses by rank position, not by raw score magnitude', () => {
    // Text scores are two orders of magnitude smaller than vector scores.
    // Under the old weighted sum this chunk's text evidence was noise; under
    // RRF, being rank 1 in BOTH lists is what counts.
    const result = mergeHybridResults(
      [{ id: 'a', content: 'a', source: 'src', doc_type: 'regulatory', vector_score: 0.51 }],
      [{ id: 'a', content: 'a', source: 'src', doc_type: 'regulatory', text_score: 0.02 }],
      5
    )
    expect(result).toHaveLength(1)
    expect(result[0].final_score).toBeCloseTo(1 / (K + 1) + 1 / (K + 1), 6)
  })

  it('ranks a chunk found by BOTH arms above one found by a single arm', () => {
    const result = mergeHybridResults(
      [
        { id: 'both', content: 'both', source: 's', doc_type: 'regulatory', vector_score: 0.50 },
        { id: 'vec',  content: 'vec',  source: 's', doc_type: 'regulatory', vector_score: 0.99 },
      ],
      [{ id: 'both', content: 'both', source: 's', doc_type: 'regulatory', text_score: 0.9 }],
      5
    )
    // 'vec' has the higher cosine, but 'both' has corroborating evidence.
    expect(result[0].id).toBe('both')
  })

  it('lets a strong text-only hit compete with vector hits', () => {
    // The FTS arm now returns real hits for keyword queries (exact identifiers
    // such as an RFP reference). Those must be able to surface even with no
    // vector hit at all.
    const result = mergeHybridResults(
      [
        { id: 'v1', content: 'v1', source: 's', doc_type: 'proposal', vector_score: 0.60 },
        { id: 'v2', content: 'v2', source: 's', doc_type: 'proposal', vector_score: 0.59 },
      ],
      [{ id: 't1', content: 't1', source: 's', doc_type: 'proposal', text_score: 1.0 }],
      5
    )
    const t1 = result.find(r => r.id === 't1')!
    expect(t1).toBeDefined()
    // rank 1 of the text list ties rank 1 of the vector list
    expect(t1.final_score).toBeCloseTo(1 / (K + 1), 6)
    expect(result[0].final_score).toBe(t1.final_score)
  })

  it('scores by position so a lower-ranked item always scores less', () => {
    const result = mergeHybridResults(
      [
        { id: 'a', content: 'a', source: 's', doc_type: 'regulatory', vector_score: 0.9 },
        { id: 'b', content: 'b', source: 's', doc_type: 'regulatory', vector_score: 0.2 },
      ],
      [],
      5
    )
    expect(result[0].final_score).toBeCloseTo(1 / (K + 1), 6)
    expect(result[1].final_score).toBeCloseTo(1 / (K + 2), 6)
    expect(result[0].final_score).toBeGreaterThan(result[1].final_score)
  })

  it('deduplicates chunks appearing in both result sets', () => {
    const result = mergeHybridResults(
      [
        { id: 'a', content: 'content a', source: 'src', doc_type: 'regulatory', vector_score: 0.9 },
        { id: 'b', content: 'content b', source: 'src', doc_type: 'regulatory', vector_score: 0.7 },
      ],
      [
        { id: 'a', content: 'content a', source: 'src', doc_type: 'regulatory', text_score: 0.8 },
        { id: 'c', content: 'content c', source: 'src', doc_type: 'regulatory', text_score: 0.6 },
      ],
      10
    )
    expect(result).toHaveLength(3)
    expect(result.map(r => r.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns at most k results, sorted descending', () => {
    const result = mergeHybridResults(
      [
        { id: 'a', content: 'a', source: 'src', doc_type: 'regulatory', vector_score: 0.9 },
        { id: 'b', content: 'b', source: 'src', doc_type: 'regulatory', vector_score: 0.8 },
        { id: 'c', content: 'c', source: 'src', doc_type: 'regulatory', vector_score: 0.7 },
      ],
      [],
      2
    )
    expect(result).toHaveLength(2)
    expect(result[0].final_score).toBeGreaterThanOrEqual(result[1].final_score)
  })

  it('handles either arm being empty', () => {
    const vOnly = mergeHybridResults(
      [{ id: 'x', content: 'content x', source: 'src', doc_type: 'regulatory', vector_score: 0.75 }], [], 5
    )
    expect(vOnly).toHaveLength(1)
    expect(vOnly[0].final_score).toBeCloseTo(1 / (K + 1), 6)

    const tOnly = mergeHybridResults(
      [], [{ id: 'y', content: 'content y', source: 'src', doc_type: 'regulatory', text_score: 0.6 }], 5
    )
    expect(tOnly).toHaveLength(1)
    expect(tOnly[0].final_score).toBeCloseTo(1 / (K + 1), 6)
  })

  it('preserves content and metadata through the fusion', () => {
    const result = mergeHybridResults(
      [{ id: 'a', content: 'the text', source: 'ICH E6', agency: 'ICH', therapeutic_area: 'onc', doc_type: 'regulatory', vector_score: 0.8 }],
      [], 5
    )
    expect(result[0].content).toBe('the text')
    expect(result[0].source).toBe('ICH E6')
    expect(result[0].agency).toBe('ICH')
    expect(result[0].therapeutic_area).toBe('onc')
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
