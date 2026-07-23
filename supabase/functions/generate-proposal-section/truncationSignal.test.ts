import { describe, it, expect } from 'vitest'
import { parseStopReason, TRUNCATION_SENTINEL } from './truncationSignal.ts'

describe('parseStopReason', () => {
  it('extracts max_tokens from a message_delta line', () => {
    const line = 'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":4000}}'
    expect(parseStopReason(line)).toBe('max_tokens')
  })
  it('extracts end_turn from a normal completion', () => {
    expect(parseStopReason('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}')).toBe('end_turn')
  })
  it('returns null for a text delta', () => {
    expect(parseStopReason('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}')).toBeNull()
  })
  it('returns null for [DONE] and malformed lines', () => {
    expect(parseStopReason('data: [DONE]')).toBeNull()
    expect(parseStopReason('event: ping')).toBeNull()
    expect(parseStopReason('data: {oops')).toBeNull()
  })
  it('sentinel is a well-formed jamo_truncated SSE data line', () => {
    expect(TRUNCATION_SENTINEL).toContain('"type":"jamo_truncated"')
    expect(TRUNCATION_SENTINEL.startsWith('data: ')).toBe(true)
  })
})
