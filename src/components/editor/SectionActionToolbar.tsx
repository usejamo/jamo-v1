import type { AIActionType } from '../../types/workspace'

interface SectionActionToolbarProps {
  sectionKey: string
  sectionTitle: string
  hasContent: boolean
  isLocked: boolean
  isStreaming: boolean
  onAction: (actionType: AIActionType) => void
  onToggleLock: () => void
  onOpenHistory: () => void
}

export function SectionActionToolbar({
  sectionTitle,
  hasContent,
  isLocked,
  isStreaming,
  onAction,
  onToggleLock,
  onOpenHistory,
}: SectionActionToolbarProps) {
  const actionButtonsDisabled = isLocked || isStreaming

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50 rounded-t-lg">
      {/* Left: section title */}
      <span className="text-base font-semibold text-gray-900">{sectionTitle}</span>

      {/* Center: action buttons */}
      <div className="flex items-center gap-2">
        {!hasContent ? (
          <button
            onClick={() => !actionButtonsDisabled && onAction('generate')}
            disabled={actionButtonsDisabled}
            className={`bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-semibold px-3 py-1.5 rounded min-h-[44px] transition-colors ${
              actionButtonsDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
            }`}
          >
            Generate Section
          </button>
        ) : (
          <>
            <button
              onClick={() => !actionButtonsDisabled && onAction('expand')}
              disabled={actionButtonsDisabled}
              className={`text-sm font-medium text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded min-h-[44px] transition-colors ${
                actionButtonsDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
              }`}
            >
              Expand
            </button>
            <button
              onClick={() => !actionButtonsDisabled && onAction('condense')}
              disabled={actionButtonsDisabled}
              className={`text-sm font-medium text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded min-h-[44px] transition-colors ${
                actionButtonsDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
              }`}
            >
              Condense
            </button>
            <button
              onClick={() => !actionButtonsDisabled && onAction('rewrite')}
              disabled={actionButtonsDisabled}
              className={`text-sm font-medium text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded min-h-[44px] transition-colors ${
                actionButtonsDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
              }`}
            >
              Rewrite
            </button>
          </>
        )}
      </div>

      {/* Right: secondary icon buttons */}
      <div className="flex items-center gap-1">
        {/* Lock/unlock — always active */}
        <button
          onClick={onToggleLock}
          className={`p-1.5 rounded transition-colors ${
            isLocked
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          title={isLocked ? 'Unlock' : 'Lock'}
        >
          {isLocked ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 0 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          )}
        </button>

        {/* History */}
        <button
          onClick={onOpenHistory}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="History"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
