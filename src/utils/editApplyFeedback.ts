import type { EditApplyFailureReason } from '../types/workspace'

/**
 * Human-readable chat message shown when an AI-proposed edit could not be applied
 * to a section. Every failure path MUST surface one of these — a proposed edit that
 * silently fails to materialize is the blank-bubble bug this replaces.
 */
export function formatEditApplyFailure(
  reason: EditApplyFailureReason,
  sectionLabel: string,
): string {
  switch (reason) {
    case 'editor-not-mounted':
      return `I couldn't apply the edit to ${sectionLabel} — that section isn't open in the editor. Scroll it into view and try again.`
    case 'section-not-active':
      return `I couldn't apply the edit to ${sectionLabel} — that section isn't available right now. Try reopening the proposal.`
    case 'no-valid-edits':
      return `I couldn't apply the edit to ${sectionLabel} — its content has changed since the suggestion was made, so the change no longer matches. Ask me to try again.`
    case 'ghost-leak':
      return `I couldn't apply the edit to ${sectionLabel} — a display conflict was detected in that section. Refresh the proposal and try again.`
  }
}
