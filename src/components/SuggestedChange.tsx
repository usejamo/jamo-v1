import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ContentBlock } from '../types/draft'
import RenderBlock from './RenderBlock'

interface Props {
  explanation: string
  suggestedPreview: string
  acceptedBlocks: ContentBlock[]
  originalChildren: React.ReactNode
  onAccept: () => void
  onDecline: () => void
}

export default function SuggestedChange({
  explanation,
  suggestedPreview,
  acceptedBlocks,
  originalChildren,
  onAccept,
  onDecline,
}: Props) {
  const [status, setStatus] = useState<'pending' | 'accepting' | 'accepted' | 'declined'>('pending')
  const [editText, setEditText] = useState(suggestedPreview)
  const [isEditing, setIsEditing] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  function handleAccept() {
    setStatus('accepting')
    setTimeout(() => {
      setStatus('accepted')
      onAccept()
    }, 600)
  }

  function handleDecline() {
    setStatus('declined')
    setTimeout(() => onDecline(), 300)
  }

  if (status === 'declined') {
    return <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.25 }}>{originalChildren}</motion.div>
  }

  if (status === 'accepted') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        {acceptedBlocks.map((block, i) => (
          <RenderBlock key={i} block={block} onAnnotationClick={() => {}} />
        ))}
      </motion.div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Highlighted section */}
      <motion.div
        animate={status === 'accepting' ? { backgroundColor: '#dcfce7' } : { backgroundColor: '#eff6ff' }}
        transition={{ duration: 0.4 }}
        className="rounded-lg border-2 border-dashed border-blue-300 px-4 py-3"
      >
        {originalChildren}
      </motion.div>

      {/* Popover */}
      <AnimatePresence>
        {status === 'pending' && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ delay: 0.5, duration: 0.25 }}
            className="absolute left-0 z-40 mt-2 w-full max-w-lg bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
            style={{ top: '100%' }}
          >
            {/* Popover header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <svg className="w-4 h-4 text-jamo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              <span className="text-xs font-semibold text-gray-700">jamo AI Suggestion</span>
            </div>

            {/* Body */}
            <div className="px-4 py-3 space-y-3">
              <p className="text-xs text-gray-600 leading-relaxed">{explanation}</p>

              {/* Preview */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Preview</p>
                {isEditing ? (
                  <textarea
                    className="w-full text-xs text-gray-700 bg-transparent resize-none outline-none leading-relaxed"
                    rows={3}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <p className="text-xs text-gray-700 leading-relaxed italic">"{editText}"</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleAccept}
                  className="inline-flex items-center gap-1.5 bg-jamo-500 hover:bg-jamo-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Accept
                </button>
                <button
                  onClick={() => setIsEditing(e => !e)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                  </svg>
                  {isEditing ? 'Done' : 'Edit'}
                </button>
                <button
                  onClick={handleDecline}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg transition-colors ml-auto"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                  Decline
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
