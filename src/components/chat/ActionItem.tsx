import React, { useState, useEffect } from 'react'
import type { PendingActionItem } from '../../types/chat'

export interface ActionItemProps {
  action: PendingActionItem
  onCtaClick: (action: PendingActionItem) => void
  onDismiss: (actionId: string) => void
  onUndoDismiss: (actionId: string) => void
}

const TYPE_BADGE_CLASSES: Record<PendingActionItem['type'], string> = {
  compliance: 'bg-red-50 text-red-700',
  conflict:   'bg-amber-50 text-amber-700',
  gap:        'bg-blue-50 text-blue-700',
  missing:    'bg-gray-100 text-gray-600',
}

export function ActionItem({ action, onCtaClick, onDismiss, onUndoDismiss }: ActionItemProps): React.ReactElement | null {
  const [justDismissed, setJustDismissed] = useState(false)

  useEffect(() => {
    if (!justDismissed) return
    const timer = setTimeout(() => setJustDismissed(false), 5000)
    return () => clearTimeout(timer)
  }, [justDismissed])

  const handleDismiss = () => {
    setJustDismissed(true)
    onDismiss(action.id)
  }

  const handleUndo = () => {
    setJustDismissed(false)
    onUndoDismiss(action.id)
  }

  return (
    <div className="flex items-start gap-2 py-2 px-3 hover:bg-gray-50 rounded-lg">
      {/* Type badge */}
      <span
        className={`text-[10px] font-normal rounded px-1.5 py-0.5 mt-0.5 shrink-0 ${TYPE_BADGE_CLASSES[action.type]}`}
      >
        {action.type.toUpperCase()}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-800 block">{action.title}</span>
        {action.resurfaced && (
          <span className="text-[10px] text-amber-600 block mt-0.5">
            Re-surfaced — section content changed since you dismissed this.
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {justDismissed ? (
          <button
            className="text-[10px] text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded"
            onClick={handleUndo}
          >
            Undo
          </button>
        ) : (
          <>
            <button
              className="text-xs bg-gray-900 text-white px-2 py-1 rounded hover:bg-gray-700"
              onClick={() => onCtaClick(action)}
            >
              {action.cta_label}
            </button>
            <button
              className="text-[10px] text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded"
              onClick={handleDismiss}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}
