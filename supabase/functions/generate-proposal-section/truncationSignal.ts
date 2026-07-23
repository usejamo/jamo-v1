// Pure, Vitest-importable (no Deno top-level imports) — mirrors the promptAssembly extraction.
// The client half of the truncation contract lives in src/hooks/useProposalGeneration.ts.

// A custom terminal SSE event. Anthropic's own events are content_block_delta / message_delta /
// message_stop, so "jamo_truncated" cannot collide with an upstream frame.
export const TRUNCATION_SENTINEL = 'data: {"type":"jamo_truncated"}\n\n'

/** Returns the stop_reason from an Anthropic `message_delta` SSE line, else null. */
export function parseStopReason(line: string): string | null {
  const t = line.trim()
  if (!t.startsWith('data:')) return null
  const raw = t.slice(t.indexOf(':') + 1).trim()
  if (!raw || raw === '[DONE]') return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.type === 'message_delta' && typeof parsed?.delta?.stop_reason === 'string') {
      return parsed.delta.stop_reason
    }
  } catch {
    // Non-JSON SSE line (event:, ping, etc.)
  }
  return null
}
