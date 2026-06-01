// Phase 14.2.2 — pure helpers for the CTA snapshot Map.
// AIChatPanel keeps the actual Map in a useRef; these helpers encode the
// capture-then-take-and-delete semantics so they can be unit-tested without
// a React provider tree (W1 closure for free-text branch coverage).

import type { OriginatingActionSnapshot, FindingType } from '../types/chat'

// The minimum shape of a pending action object the CTA handler has in scope.
// (Subset of PendingActionItem to keep coupling thin.)
export type CtaActionLike = {
  id: string
  section_key: string
  type: FindingType
  title: string
  description?: string | null
  cta_tool: string
}

export function makeCtaKey(parts: { section_key: string; cta_tool: string }): string {
  return `${parts.section_key}:${parts.cta_tool}`
}

export function captureSnapshot(
  map: Map<string, OriginatingActionSnapshot>,
  action: CtaActionLike,
): OriginatingActionSnapshot {
  const snapshot: OriginatingActionSnapshot = {
    id: action.id,
    section_key: action.section_key,
    finding_type: action.type,
    title: action.title,
    description: action.description ?? '',
  }
  map.set(makeCtaKey({ section_key: action.section_key, cta_tool: action.cta_tool }), snapshot)
  return snapshot
}

/**
 * Take-and-delete. Returns the snapshot if present (queue-origin propose_edit),
 * or null if absent (free-text origin per D-10). Always deletes after read.
 */
export function takeSnapshot(
  map: Map<string, OriginatingActionSnapshot>,
  section_key: string,
  cta_tool: string,
): OriginatingActionSnapshot | null {
  const key = makeCtaKey({ section_key, cta_tool })
  const snapshot = map.get(key) ?? null
  map.delete(key)
  return snapshot
}
