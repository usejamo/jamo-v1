import { useState, useEffect, useRef } from 'react'
import type { AIActionType } from '../../types/workspace'

type InlineActionType = 'expand' | 'condense' | 'rewrite'

const PLACEHOLDERS: Record<InlineActionType, string> = {
  expand: 'What should we go deeper on?',
  condense: 'Anything that must stay in?',
  rewrite: 'What tone or angle are you going for?',
}

interface SectionActionToolbarProps {
  sectionKey: string
  sectionTitle: string
  hasContent: boolean
  isLocked: boolean
  isStreaming: boolean
  onAction: (actionType: AIActionType, userInstructions?: string) => void
  onToggleLock: () => void
  onOpenHistory: () => void
  /** Override narrow detection — useful for tests and known-narrow embedding contexts */
  forceNarrow?: boolean
}

export function SectionActionToolbar({
  sectionTitle,
  hasContent,
  isLocked,
  isStreaming,
  onAction,
  onToggleLock,
  onOpenHistory,
  forceNarrow,
}: SectionActionToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [observedNarrow, setObservedNarrow] = useState(false)
  const [activeAction, setActiveAction] = useState<InlineActionType | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const isNarrow = forceNarrow ?? observedNarrow
  const actionButtonsDisabled = isLocked || isStreaming

  // Watch toolbar width and collapse to dropdown below 520px
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setObservedNarrow(entry.contentRect.width < 520)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [dropdownOpen])

  function handleActionClick(action: InlineActionType) {
    if (actionButtonsDisabled) return
    setDropdownOpen(false)
    if (activeAction === action) {
      setActiveAction(null)
      setInputValue('')
    } else {
      setActiveAction(action)
      setInputValue('')
    }
  }

  function handleRun() {
    if (!activeAction) return
    onAction(activeAction, inputValue.trim() || undefined)
    setActiveAction(null)
    setInputValue('')
  }

  function handleCancel() {
    setActiveAction(null)
    setInputValue('')
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50 rounded-t-lg"
    >
      {/* Left: section title */}
      <span className="text-base font-semibold text-gray-900 truncate mr-2">{sectionTitle}</span>

      {/* Center: action buttons + optional inline input */}
      <div className="flex flex-col items-center gap-1 shrink-0">
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
          ) : isNarrow ? (
            /* Narrow mode: single dropdown */
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => !actionButtonsDisabled && setDropdownOpen((o) => !o)}
                disabled={actionButtonsDisabled}
                className={`text-sm font-medium text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded min-h-[44px] transition-colors flex items-center gap-1 ${
                  actionButtonsDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
                }`}
              >
                Actions
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-md z-10 min-w-[120px]">
                  {(['expand', 'condense', 'rewrite'] as InlineActionType[]).map((action) => (
                    <button
                      key={action}
                      onClick={() => handleActionClick(action)}
                      className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 px-3 py-2 first:rounded-t last:rounded-b transition-colors"
                    >
                      {action.charAt(0).toUpperCase() + action.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Wide mode: 3 individual buttons */
            <>
              {(['expand', 'condense', 'rewrite'] as InlineActionType[]).map((action) => (
                <button
                  key={action}
                  onClick={() => handleActionClick(action)}
                  disabled={actionButtonsDisabled}
                  className={`text-sm font-medium px-3 py-1.5 rounded min-h-[44px] transition-colors ${
                    activeAction === action
                      ? 'bg-jamo-100 text-jamo-700 ring-1 ring-jamo-400'
                      : 'text-gray-700 hover:bg-gray-100'
                  } ${actionButtonsDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </button>
              ))}
            </>
          )}
        </div>

        {activeAction && (
          <div className="flex items-center gap-2 w-full max-w-sm">
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={PLACEHOLDERS[activeAction]}
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-jamo-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRun()
                if (e.key === 'Escape') handleCancel()
              }}
            />
            <button
              onClick={handleRun}
              className="text-sm font-medium bg-jamo-500 hover:bg-jamo-600 text-white px-3 py-1 rounded transition-colors"
            >
              Run
            </button>
          </div>
        )}
      </div>

      {/* Right: secondary icon buttons — always visible */}
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {/* Lock/unlock */}
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
