import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markdownToHtml } from '../../lib/markdownToHtml'

interface AIActionPreviewProps {
  previewContent: string
  isStreaming: boolean
  actionType: 'expand' | 'condense' | 'generate' | 'rewrite'
  onAccept: () => void
  onDecline: () => void
}

export function AIActionPreview({
  previewContent,
  isStreaming,
  actionType,
  onAccept,
  onDecline,
}: AIActionPreviewProps) {
  const [accepting, setAccepting] = useState(false)

  const label = actionType.charAt(0).toUpperCase() + actionType.slice(1)

  function handleAccept() {
    setAccepting(true)
    setTimeout(() => {
      setAccepting(false)
      onAccept()
    }, 400)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, delay: 0.5 }}
        className="mt-3 rounded-lg p-4 border border-blue-100"
        style={{ backgroundColor: accepting ? '#dcfce7' : '#eff6ff' }}
      >
        {/* Label */}
        <p className="text-xs font-semibold text-blue-700 mb-2">
          {isStreaming ? 'Generating...' : `Preview: ${label}`}
        </p>

        {/* Preview content */}
        <div className="text-sm text-gray-700 leading-relaxed">
          <span dangerouslySetInnerHTML={{ __html: markdownToHtml(previewContent) }} />
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Button row */}
        <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-blue-100">
          <button
            onClick={onDecline}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={isStreaming}
            className={`bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-semibold px-4 py-2 rounded transition-colors ${
              isStreaming ? 'opacity-40 cursor-not-allowed' : ''
            }`}
          >
            Accept
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
