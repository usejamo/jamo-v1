import React from 'react'
import type { ActiveTask } from '../../types/chat'

export interface ResumeTaskBannerProps {
  activeTask: ActiveTask
  currentSectionContent: string
  onContinue: () => void
  onStartOver: () => void
  onRestart: () => void
  onDiscard: () => void
}

function simpleHash(s: string): string {
  let h = 0
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0
  return Math.abs(h).toString(16).slice(0, 8)
}

export function ResumeTaskBanner({
  activeTask,
  currentSectionContent,
  onRestart,
  onDiscard,
}: ResumeTaskBannerProps): React.ReactElement | null {
  const currentHash = simpleHash(currentSectionContent.replace(/<[^>]*>/g, ''))
  const hasDrift = !!activeTask.content_hash && currentHash !== activeTask.content_hash

  // No drift: continue item is rendered by ActionQueue, not by this banner
  if (!hasDrift) return null

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-2">
      <p className="text-xs text-amber-800 mb-2">
        Content has changed since this walkthrough started — restart or discard?
      </p>
      <div className="flex gap-2">
        <button
          className="text-xs bg-gray-900 text-white px-3 py-1 rounded hover:bg-gray-700"
          onClick={onRestart}
        >
          Restart
        </button>
        <button
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded"
          onClick={onDiscard}
        >
          Discard walkthrough
        </button>
      </div>
    </div>
  )
}
