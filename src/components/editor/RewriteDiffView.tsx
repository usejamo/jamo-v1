import { useState } from 'react'
import { motion } from 'framer-motion'

interface RewriteDiffViewProps {
  beforeContent: string
  afterContent: string
  isStreaming: boolean
  onApply: () => void
  onDiscard: () => void
}

export function RewriteDiffView({
  beforeContent,
  afterContent,
  isStreaming,
  onApply,
  onDiscard,
}: RewriteDiffViewProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-3 border border-gray-200 rounded-lg overflow-hidden"
    >
      {/* Two-column before/after */}
      <div className="grid grid-cols-2 divide-x divide-gray-200">
        {/* Before */}
        <div className="p-4 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 mb-2">Before</p>
          <div
            className="text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: beforeContent }}
          />
        </div>

        {/* After */}
        <div className="p-4 bg-white">
          <p className="text-xs font-semibold text-gray-500 mb-2">After</p>
          <div className="text-sm text-gray-700 leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: afterContent }} />
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        </div>
      </div>

      {/* Button row */}
      <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
        {confirmingDiscard ? (
          <>
            <span className="text-sm text-gray-600 mr-auto">
              Discard this rewrite? The original content will be restored.
            </span>
            <button
              onClick={() => setConfirmingDiscard(false)}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              Keep Editing
            </button>
            <button
              onClick={onDiscard}
              className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              Discard
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmingDiscard(true)}
              className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              Discard
            </button>
            <button
              onClick={onApply}
              disabled={isStreaming}
              className={`bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-semibold px-4 py-2 rounded transition-colors ${
                isStreaming ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              Apply Rewrite
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}
