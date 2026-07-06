/**
 * Incremental SSE line parser. `reader.read()` chunks do NOT align with SSE event
 * boundaries — a single `data:` line can be split across two reads. This carries the
 * incomplete trailing line forward in `buffer` so a split frame is never dropped
 * (the silent-failure bug where large multi-tool `tool_result` frames vanished).
 *
 * Returns the complete `data:` payloads (with the `data: ` prefix stripped and
 * trimmed) now available, plus the leftover buffer to pass into the next call.
 */
export function drainSSEChunk(buffer: string, chunk: string): { events: string[]; buffer: string } {
  const combined = buffer + chunk
  const lines = combined.split('\n')
  // The final element is the (possibly incomplete) trailing line — carry it forward.
  const rest = lines.pop() ?? ''
  const events: string[] = []
  for (const line of lines) {
    if (line.startsWith('data: ')) events.push(line.slice(6).trim())
  }
  return { events, buffer: rest }
}
