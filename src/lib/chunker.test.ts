// src/lib/chunker.test.ts
import { describe, it, expect } from 'vitest'
import { chunkDocument } from './chunker'

describe('chunkDocument', () => {
  it('splits text at section headings', () => {
    // Each section must be large enough (>= MIN_TOKENS=400) so they are not merged together
    const sentence = 'This is a regulatory document sentence with multiple words used to test section boundary detection. '
    const text = '1. Background\n' + sentence.repeat(30) + '\n2. Scope\n' + sentence.repeat(30)
    const chunks = chunkDocument(text, 'test.pdf')
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // Each chunk should have a sectionRef pointing to its section
    const backgroundChunk = chunks.find(c => c.sectionRef?.startsWith('1.'))
    const scopeChunk = chunks.find(c => c.sectionRef?.startsWith('2.'))
    expect(backgroundChunk).toBeDefined()
    expect(scopeChunk).toBeDefined()
  })

  it('produces chunks of 400–600 tokens for large segments', () => {
    // Build a segment with ~700 tokens — should be split into windowed chunks ≤600 tokens
    // Use a long repeating sentence to guarantee token count
    const longText = '1. Introduction\n' + ('This is a regulatory document sentence with multiple words used to test token counting. ').repeat(50)
    const chunks = chunkDocument(longText, 'large.pdf')
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(600)
    }
    // At least one chunk should exist
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })

  it('merges segments shorter than 400 tokens with next', () => {
    // Two short sections, each well under 400 tokens — should merge into one chunk
    const text = '1. Short Section A\nShort text A.\n2. Short Section B\nShort text B.'
    const chunks = chunkDocument(text, 'short.pdf')
    // Both sections are tiny — they should be merged, producing 1 chunk (not 2)
    expect(chunks.length).toBe(1)
  })

  it('returns typed Chunk objects with correct shape', () => {
    const text = '1. Background\n' + 'Some regulatory text. '.repeat(10)
    const chunks = chunkDocument(text, 'typed.pdf')
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(typeof chunk.content).toBe('string')
      expect(typeof chunk.source).toBe('string')
      expect(typeof chunk.tokenCount).toBe('number')
      expect(chunk.source).toBe('typed.pdf')
      expect(chunk.tokenCount).toBeGreaterThan(0)
    }
  })
})
