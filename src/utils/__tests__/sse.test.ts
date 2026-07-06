import { describe, it, expect } from 'vitest'
import { drainSSEChunk } from '../sse'

describe('drainSSEChunk', () => {
  it('extracts a complete data payload from a single chunk', () => {
    const { events, buffer } = drainSSEChunk('', 'data: {"type":"a"}\n\n')
    expect(events).toEqual(['{"type":"a"}'])
    expect(buffer).toBe('')
  })

  it('buffers a data line split across two chunks and emits it once complete (the bug fix)', () => {
    const first = drainSSEChunk('', 'data: {"type":"tool_result","sec')
    expect(first.events).toEqual([]) // incomplete — nothing emitted yet
    const second = drainSSEChunk(first.buffer, 'tion":"cover_letter"}\n\n')
    expect(second.events).toEqual(['{"type":"tool_result","section":"cover_letter"}'])
  })

  it('emits multiple complete events from one chunk', () => {
    const { events } = drainSSEChunk('', 'data: {"n":1}\n\ndata: {"n":2}\n\n')
    expect(events).toEqual(['{"n":1}', '{"n":2}'])
  })

  it('ignores non-data lines (comments, blank lines)', () => {
    const { events } = drainSSEChunk('', ': ping\n\ndata: {"n":1}\n\n')
    expect(events).toEqual(['{"n":1}'])
  })

  it('carries an incomplete trailing line forward in the buffer', () => {
    const { events, buffer } = drainSSEChunk('', 'data: {"n":1}\n\ndata: {"partial"')
    expect(events).toEqual(['{"n":1}'])
    expect(buffer).toBe('data: {"partial"')
  })

  it('handles the [DONE] sentinel like any other payload', () => {
    const { events } = drainSSEChunk('', 'data: [DONE]\n\n')
    expect(events).toEqual(['[DONE]'])
  })
})
