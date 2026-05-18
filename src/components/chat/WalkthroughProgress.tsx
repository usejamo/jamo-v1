import React from 'react'
import type { ActiveTask } from '../../types/chat'

export interface WalkthroughProgressProps {
  activeTask: ActiveTask
  onStopWalkthrough: () => void
}

function stageLabel(stage: ActiveTask['stage']): string {
  switch (stage) {
    case 'gathering_inputs': return 'Gathering inputs'
    case 'drafting':         return 'Drafting'
    case 'complete':         return 'Complete'
    case 'discarded':        return 'Discarded'
    default:                 return ''
  }
}

export function WalkthroughProgress({ activeTask, onStopWalkthrough }: WalkthroughProgressProps): React.ReactElement | null {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-gray-800 font-normal truncate">
          Working on: {activeTask.section_title}
        </span>
        <span className="text-[10px] text-gray-500">
          {stageLabel(activeTask.stage)}
        </span>
      </div>
      <div className="flex flex-col items-end shrink-0 ml-3">
        <button
          className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-300 bg-white"
          onClick={onStopWalkthrough}
        >
          Stop walkthrough
        </button>
        <span className="text-[10px] text-gray-400 mt-0.5">
          Accepted changes will stay in your document.
        </span>
      </div>
    </div>
  )
}
