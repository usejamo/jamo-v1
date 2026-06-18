import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PendingActionItem } from '../../types/chat'
import { ActionItem } from './ActionItem'

// Queue item state machine: pending → dismissed | completed | skipped
export const QUEUE_ITEM_STATES = {
  PENDING:   'pending',
  DISMISSED: 'dismissed',
  COMPLETED: 'completed',
  SKIPPED:   'skipped',
} as const
export type QueueItemState = typeof QUEUE_ITEM_STATES[keyof typeof QUEUE_ITEM_STATES]

const MAX_VISIBLE = 8

export interface ActionQueueProps {
  actions: PendingActionItem[]
  activeTaskSectionTitle?: string | null
  isWalkthroughActive: boolean
  onCtaClick: (action: PendingActionItem) => void
  onDismiss: (actionId: string) => void
  onUndoDismiss: (actionId: string) => void
  onContinueWalkthrough: () => void
}

export function ActionQueue({
  actions,
  activeTaskSectionTitle,
  isWalkthroughActive,
  onCtaClick,
  onDismiss,
  onUndoDismiss,
  onContinueWalkthrough,
}: ActionQueueProps): React.ReactElement | null {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  // Auto-collapse when walkthrough starts
  useEffect(() => {
    if (isWalkthroughActive) setIsCollapsed(true)
  }, [isWalkthroughActive])

  // Acting on a suggestion collapses the queue so the editor/walkthrough is unobstructed.
  // The user re-opens via the header toggle; the parent's onCtaClick still runs as before.
  const handleCtaClick = (action: PendingActionItem) => {
    setIsCollapsed(true)
    onCtaClick(action)
  }

  const active = [...actions.filter(a => !a.dismissed)].sort((a, b) => a.priority - b.priority)
  const dismissed = actions.filter(a => a.dismissed)

  const visibleActive = showOverflow ? active : active.slice(0, MAX_VISIBLE)
  const overflowCount = active.length - MAX_VISIBLE

  return (
    <div className="border-b border-gray-100 bg-white">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left"
        onClick={() => setIsCollapsed(c => !c)}
        aria-expanded={!isCollapsed}
      >
        <span className="text-xs font-semibold text-gray-700">Suggestions</span>
        <span className="flex items-center gap-1.5">
          {isCollapsed && active.length > 0 && (
            <span className="text-[10px] text-gray-500">{active.length} items in queue</span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {/* Body */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="queue-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-0 pb-1">
              {/* Active walkthrough continue item */}
              {activeTaskSectionTitle && isWalkthroughActive && (
                <div className="flex items-center gap-2 py-2 px-3 bg-jamo-50 rounded-lg border border-jamo-200 mx-3 mb-1">
                  <span className="text-xs text-jamo-700 flex-1">
                    Continue {activeTaskSectionTitle} walkthrough
                  </span>
                  <button
                    className="text-xs bg-jamo-600 text-white px-2 py-1 rounded hover:bg-jamo-700"
                    onClick={onContinueWalkthrough}
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* Empty state */}
              {active.length === 0 && !isWalkthroughActive && (
                <p className="text-xs text-gray-400 px-3 py-4">
                  No suggestions right now. Ask me anything below.
                </p>
              )}

              {/* Active items */}
              <AnimatePresence initial={false}>
                {visibleActive.map(action => (
                  <motion.div
                    key={action.id}
                    initial={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ActionItem
                      action={action}
                      onCtaClick={handleCtaClick}
                      onDismiss={onDismiss}
                      onUndoDismiss={onUndoDismiss}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Overflow footer */}
              {!showOverflow && overflowCount > 0 && (
                <button
                  className="w-full text-left text-[10px] text-gray-400 hover:text-gray-600 px-3 py-1.5"
                  onClick={() => setShowOverflow(true)}
                >
                  +{overflowCount} more — focus on these first
                </button>
              )}

              {/* Dismissed section */}
              {dismissed.length > 0 && (
                <div className="mt-1 border-t border-gray-100">
                  <button
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-50 text-left"
                    onClick={() => setShowDismissed(d => !d)}
                  >
                    <span className="text-[10px] text-gray-400">{dismissed.length} dismissed</span>
                    <svg
                      className={`w-3 h-3 text-gray-300 transition-transform ${showDismissed ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <AnimatePresence initial={false}>
                    {showDismissed && (
                      <motion.div
                        key="dismissed-section"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden opacity-60"
                      >
                        {dismissed.map(action => (
                          <ActionItem
                            key={action.id}
                            action={action}
                            onCtaClick={handleCtaClick}
                            onDismiss={onDismiss}
                            onUndoDismiss={onUndoDismiss}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
