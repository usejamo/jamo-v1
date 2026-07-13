// src/lib/chunker.ts
// Uses js-tiktoken for accurate BPE token counting (cl100k_base — matches text-embedding-3-small)
// DO NOT use character count heuristics — inaccurate for regulatory abbreviations

import { getEncoding } from 'js-tiktoken'

export interface Chunk {
  content: string
  source: string        // document filename
  tokenCount: number
  sectionRef?: string   // last section heading seen before this chunk
}

const CHUNK_MAX_TOKENS = 600
const OVERLAP_TOKENS = 100
const MIN_TOKENS = 400

// Section heading detection for regulatory docs: "4.", "4.1", "ICH E6 Section X"
const SECTION_HEADING_RE = /^(\d+\.[\d.]*)\s+\S/m

// Lazy-init encoder so it's only loaded when chunker is used
let _enc: ReturnType<typeof getEncoding> | null = null
function getEncoder() {
  if (!_enc) {
    _enc = getEncoding('cl100k_base')
  }
  return _enc
}

/** Count tokens in a string using cl100k_base BPE encoding */
function countTokens(text: string): number {
  return getEncoder().encode(text).length
}

/**
 * Split text into overlapping windows of ≤CHUNK_MAX_TOKENS tokens.
 *
 * Encodes the segment ONCE and slices token ranges (O(n)). The previous
 * word-growing implementation re-encoded a progressively longer window on every
 * step — O(n²) BPE `encode` calls — which burned enough CPU on larger segments to
 * trip the Supabase Edge isolate's CPU-time limit (WORKER_RESOURCE_LIMIT / HTTP
 * 546), killing extraction. Slicing token ids and decoding each window is both
 * far cheaper and exact on the ≤CHUNK_MAX_TOKENS bound.
 */
function windowSegment(text: string, source: string, sectionRef: string | undefined): Chunk[] {
  const enc = getEncoder()
  const tokens = enc.encode(text)
  const chunks: Chunk[] = []
  const step = CHUNK_MAX_TOKENS - OVERLAP_TOKENS // advance, retaining OVERLAP_TOKENS of overlap

  for (let start = 0; start < tokens.length; start += step) {
    const windowTokens = tokens.slice(start, start + CHUNK_MAX_TOKENS)
    if (windowTokens.length === 0) break
    chunks.push({
      content: enc.decode(windowTokens),
      source,
      tokenCount: windowTokens.length,
      sectionRef,
    })
    // Last window reached — stop before emitting a tiny trailing overlap-only chunk.
    if (start + CHUNK_MAX_TOKENS >= tokens.length) break
  }

  return chunks
}

/**
 * chunkDocument splits a regulatory text string into Chunk[] objects.
 * Strategy:
 *  1. Split on section heading boundaries, tracking sectionRef
 *  2. For segments > CHUNK_MAX_TOKENS: apply sliding window with OVERLAP_TOKENS
 *  3. For segments < MIN_TOKENS: merge with next segment before chunking
 *  4. Return typed Chunk[] with content, source, tokenCount, sectionRef
 */
export function chunkDocument(text: string, source: string): Chunk[] {
  // Split into lines and group by section heading boundaries
  const lines = text.split('\n')
  const segments: Array<{ heading: string | undefined; text: string }> = []
  let currentHeading: string | undefined = undefined
  let currentLines: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(SECTION_HEADING_RE)
    if (headingMatch) {
      // Save previous segment
      if (currentLines.length > 0) {
        segments.push({ heading: currentHeading, text: currentLines.join('\n') })
        currentLines = []
      }
      currentHeading = headingMatch[1]
      currentLines.push(line)
    } else {
      currentLines.push(line)
    }
  }
  // Push final segment
  if (currentLines.length > 0) {
    segments.push({ heading: currentHeading, text: currentLines.join('\n') })
  }

  // Merge short segments (< MIN_TOKENS) with next segment
  const mergedSegments: Array<{ heading: string | undefined; text: string }> = []
  let i = 0
  while (i < segments.length) {
    const seg = segments[i]
    const tokens = countTokens(seg.text)
    if (tokens < MIN_TOKENS && i + 1 < segments.length) {
      // Merge with next
      const next = segments[i + 1]
      segments[i + 1] = {
        heading: seg.heading ?? next.heading,
        text: seg.text + '\n' + next.text,
      }
      i++
      continue
    }
    mergedSegments.push(seg)
    i++
  }

  // If all segments were merged away (e.g., only 1 left after merging), handle the last one
  if (mergedSegments.length === 0 && segments.length > 0) {
    mergedSegments.push(segments[segments.length - 1])
  }

  // Produce chunks from each merged segment
  const result: Chunk[] = []
  for (const seg of mergedSegments) {
    const tokens = countTokens(seg.text)
    if (tokens <= CHUNK_MAX_TOKENS) {
      result.push({ content: seg.text, source, tokenCount: tokens, sectionRef: seg.heading })
    } else {
      // Apply sliding window
      const windows = windowSegment(seg.text, source, seg.heading)
      result.push(...windows)
    }
  }

  return result
}
