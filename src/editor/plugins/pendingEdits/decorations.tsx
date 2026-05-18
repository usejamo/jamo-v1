import { DecorationSet } from '@tiptap/pm/view'

// Stub — implemented in Plan 03
export function buildDecorations(
  _pending: any[],
  _doc: any,
  _dispatch: any,
  _sectionKey: string,
): DecorationSet {
  return DecorationSet.empty
}

/**
 * Ghost isolation guard (AI-SPEC Section 6, online guardrail).
 * Returns true if editorHtml contains any ghost content — caller must block SET_PENDING_EDITS.
 * Stub — full implementation in Plan 03.
 */
export function ghostContentLeakDetected(
  _editorHtml: string,
  _pending: any[],
): boolean {
  return false
}
