import React, { useState } from 'react'
import type { ProposeEditPayload, ProposeEditState } from '../../types/chat'

export interface EditSummaryCardProps {
  payload: ProposeEditPayload
  state: ProposeEditState
  sectionKey: string
  /** Required — identifies which proposal_chats row to persist resolutions to */
  message_id: string
  onReviewInEditor: () => void
  onAcceptAll: () => void   // D-03: parent wires to BATCH_ACCEPT_PENDING_EDITS dispatch
  onRejectAll: () => void
  onUpdateResolution?: (changeId: string, resolution: 'accepted' | 'rejected') => void
}

export function EditSummaryCard({
  payload, state, message_id, onReviewInEditor, onAcceptAll, onRejectAll, onUpdateResolution,
}: EditSummaryCardProps): React.ReactElement | null {
  const [showDrillDown, setShowDrillDown] = useState(false)

  const changes = payload.changes
  // Stable per-change identity — matches PendingEdit.id (`${message_id}-${change_index}`).
  // paragraph_id is NOT unique: the model often anchors several changes to one paragraph.
  const changeId = (i: number): string => `${message_id}-${i}`
  const counts = { accepted: 0, rejected: 0, auto_rejected_stale: 0, not_reached: 0, pending: 0 }
  changes.forEach((_change, i) => {
    const res = (state.resolutions?.[changeId(i)] ?? 'pending') as keyof typeof counts
    counts[res] = (counts[res] ?? 0) + 1
  })
  const isTerminal = counts.pending === 0 && changes.length > 0

  // Regulatory hedge warning (AI-SPEC online guardrail 3)
  const hedgePhrases = ['aims to', 'endeavors to', 'intends to', 'will try to', 'seeks to ensure']
  const summaryText = [payload.overall_summary, ...changes.map((c) => c.change_summary)].join(' ').toLowerCase()
  const hasHedge = hedgePhrases.some((p) => summaryText.includes(p))

  const resolutionLabel: Record<string, { text: string; className: string }> = {
    accepted:             { text: 'Accepted',                                          className: 'text-emerald-600' },
    rejected:             { text: 'Rejected',                                          className: 'text-gray-500' },
    auto_rejected_stale:  { text: 'Stale — paragraph was edited before review',        className: 'text-red-500' },
    not_reached:          { text: 'Not reviewed — walkthrough stopped',                className: 'text-gray-400' },
    pending:              { text: 'Pending',                                           className: 'text-gray-400' },
  }

  const tallyParts: string[] = []
  if (counts.accepted > 0) tallyParts.push(`${counts.accepted} accepted`)
  if (counts.rejected > 0) tallyParts.push(`${counts.rejected} rejected`)
  if (counts.auto_rejected_stale > 0) tallyParts.push(`${counts.auto_rejected_stale} stale`)
  if (counts.not_reached > 0) tallyParts.push(`${counts.not_reached} not reviewed`)
  if (counts.pending > 0) tallyParts.push(`${counts.pending} to review`)
  const tallyString = tallyParts.join(', ')

  const wrapperClass = isTerminal
    ? 'border border-gray-200 rounded-lg p-3 bg-white opacity-75'
    : 'border border-gray-200 rounded-lg p-3 bg-white'

  return (
    <div className={wrapperClass}>
      {hasHedge && (
        <div className="text-amber-700 bg-amber-50 border border-amber-200 text-xs px-3 py-2 rounded mb-2">
          Review: proposed text may use non-normative language — verify against GCP obligations before accepting
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-800">
          {isTerminal ? 'Changes reviewed' : 'Review proposed changes'}
        </span>
        <button
          className="text-xs text-gray-400 hover:text-gray-600"
          onClick={() => setShowDrillDown((v) => !v)}
          aria-expanded={showDrillDown}
          aria-label={showDrillDown ? 'Hide change details' : 'Show change details'}
        >
          {showDrillDown ? 'Hide details' : 'Show details'}
        </button>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed mb-2">{tallyString}</p>

      {!isTerminal && (
        <div className="flex items-center gap-2 mb-2">
          <button
            className="text-xs text-jamo-600 hover:underline cursor-pointer"
            onClick={onReviewInEditor}
            aria-label="Review proposed changes in the document editor"
          >
            Review in editor →
          </button>
          <button
            className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg hover:bg-gray-700"
            onClick={onAcceptAll}
            aria-label="Accept all proposed changes"
          >
            Accept all
          </button>
          <button
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100"
            onClick={onRejectAll}
            aria-label="Reject all proposed changes"
          >
            Reject all
          </button>
        </div>
      )}

      {showDrillDown && (
        <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2" aria-label="Individual change resolutions">
          {changes.map((change, i) => {
            const id = changeId(i)
            const res = (state.resolutions?.[id] ?? 'pending') as string
            const label = resolutionLabel[res] ?? resolutionLabel.pending
            return (
              <li key={id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-600 flex-1 truncate">{change.change_summary}</span>
                {res === 'pending' && onUpdateResolution ? (
                  <span className="flex gap-1">
                    <button
                      className="text-[10px] bg-gray-900 text-white px-2 py-0.5 rounded hover:bg-gray-700"
                      onClick={() => onUpdateResolution(id, 'accepted')}
                      aria-label={`Accept: ${change.change_summary}`}
                    >Accept</button>
                    <button
                      className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-100"
                      onClick={() => onUpdateResolution(id, 'rejected')}
                      aria-label={`Reject: ${change.change_summary}`}
                    >Reject</button>
                  </span>
                ) : (
                  <span className={`text-[10px] ${label.className}`}>{label.text}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
