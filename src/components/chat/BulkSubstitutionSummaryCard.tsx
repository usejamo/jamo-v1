import React from 'react'

// NOTE: SkipEntry mirrors the contract exported by Plan 01's
// src/editor/placeholders/substitute.ts (ReconciledOutcome/SkipEntry). That module had not
// landed in this worktree at execution time, so the shape is declared locally here to keep
// this card purely presentational and independently type-checkable. Plan 04 will thread the
// real SkipEntry type through from substitute.ts — the shapes are structurally identical.
export interface SkipEntry {
  section_key: string
  label: string
  reason: string
}

export interface BulkSubstitutionSummaryCardProps {
  value: string
  appliedBySection: Array<{ section_key: string; section_title?: string; count: number }>
  skipped: SkipEntry[]
  outcome: 'full' | 'partial' // zero-match never renders this card (parent suppresses)
  onAcceptAll: () => void // parent fans BATCH_ACCEPT across sections (Plan 04)
  onRejectAll: () => void // parent rejects all across sections (Plan 04)
  resolved?: 'accepted' | 'rejected' // when set, show terminal state, hide action buttons
}

export function BulkSubstitutionSummaryCard({
  value, appliedBySection, skipped, onAcceptAll, onRejectAll, resolved,
}: BulkSubstitutionSummaryCardProps): React.ReactElement {
  const totalApplied = appliedBySection.reduce((sum, s) => sum + s.count, 0)
  const isTerminal = resolved !== undefined

  const resolvedLabel: Record<'accepted' | 'rejected', { text: string; className: string }> = {
    accepted: { text: 'Accepted', className: 'text-emerald-600' },
    rejected: { text: 'Rejected', className: 'text-gray-500' },
  }

  const wrapperClass = isTerminal
    ? 'border border-gray-200 rounded-lg p-3 bg-white opacity-75'
    : 'border border-gray-200 rounded-lg p-3 bg-white'

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-800">
          Substituted &quot;{value}&quot;
        </span>
        <span className="text-xs text-gray-500">{totalApplied} applied</span>
      </div>

      {appliedBySection.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-gray-500 mb-1">Applied</p>
          <ul className="space-y-0.5" aria-label="Substitutions applied by section">
            {appliedBySection.map((section) => (
              <li key={section.section_key} className="text-xs text-gray-600 flex items-center justify-between gap-2">
                <span className="truncate">{section.section_title ?? section.section_key}</span>
                <span className="text-gray-400 shrink-0">{section.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-gray-500 mb-1">Skipped</p>
          <ul className="space-y-0.5" aria-label="Skipped substitutions">
            {skipped.map((skip, i) => (
              <li key={`${skip.section_key}-${skip.label}-${i}`} className="text-xs text-amber-700 leading-relaxed">
                {skip.section_key} — {skip.label}: {skip.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isTerminal ? (
        <span className={`text-xs ${resolvedLabel[resolved].className}`}>{resolvedLabel[resolved].text}</span>
      ) : (
        <div className="flex items-center gap-2">
          <button
            className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg hover:bg-gray-700"
            onClick={onAcceptAll}
            aria-label="Accept all substitutions"
          >
            Accept all
          </button>
          <button
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100"
            onClick={onRejectAll}
            aria-label="Reject all substitutions"
          >
            Reject all
          </button>
        </div>
      )}
    </div>
  )
}
