import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import type { VersionEntry } from '../../types/workspace'

interface VersionHistoryOverlayProps {
  proposalId: string
  orgId: string
  sectionKey: string
  currentContent: string
  onRestore: (content: string, label: string) => void
  onClose: () => void
}

export function VersionHistoryOverlay({
  proposalId,
  sectionKey,
  currentContent,
  onRestore,
  onClose,
}: VersionHistoryOverlayProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchVersions() {
      setLoading(true)
      const { data } = await supabase
        .from('proposal_section_versions')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('section_key', sectionKey)
        .order('created_at', { ascending: false })
        .limit(20)
      setVersions((data as VersionEntry[]) ?? [])
      setLoading(false)
    }
    fetchVersions()
  }, [proposalId, sectionKey])

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null

  function formatTimestamp(created_at: string): string {
    const d = new Date(created_at)
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${date}, ${time}`
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
        aria-label="Close version history"
      />

      {/* Slide-in panel */}
      <motion.div
        className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-50 flex flex-col"
        initial={{ x: 320, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 320, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Version History</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading versions...</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No version history yet</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                onClick={() => setSelectedId(v.id === selectedId ? null : v.id)}
                className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  v.id === selectedId ? 'bg-blue-50' : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{v.action_label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatTimestamp(v.created_at)}</p>
              </div>
            ))
          )}
        </div>

        {/* Diff view */}
        {selectedVersion && (
          <div className="border-t border-gray-200 overflow-y-auto max-h-64">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Version content</p>
              <div
                className="text-xs text-gray-700 prose prose-xs max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedVersion.content }}
              />
            </div>
            <div className="px-4 py-2 bg-white">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current content</p>
              <div
                className="text-xs text-gray-700 prose prose-xs max-w-none"
                dangerouslySetInnerHTML={{ __html: currentContent }}
              />
            </div>
          </div>
        )}

        {/* Footer — restore button */}
        {selectedVersion && (
          <div className="px-4 py-3 border-t border-gray-200">
            <button
              onClick={() => onRestore(selectedVersion.content, selectedVersion.action_label)}
              className="bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-semibold px-4 py-2 rounded w-full transition-colors"
            >
              Restore this version
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
