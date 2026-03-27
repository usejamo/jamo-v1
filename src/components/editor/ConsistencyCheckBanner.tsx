import { motion } from 'framer-motion'
import type { ConsistencyFlag } from '../../types/workspace'

interface ConsistencyCheckBannerProps {
  flags: ConsistencyFlag[]
  onDismiss: () => void
}

export function ConsistencyCheckBanner({ flags, onDismiss }: ConsistencyCheckBannerProps) {
  if (!flags || flags.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-amber-900">Cross-Section Review</span>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss consistency check banner"
        >
          {/* X icon */}
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Flag list */}
      <ul className="list-disc list-inside space-y-1">
        {flags.map((flag) => (
          <li key={flag.id} className="text-sm text-amber-800">
            {flag.message}
            {flag.sections_involved && flag.sections_involved.length > 0 && (
              <span className="text-gray-500 ml-1">
                (sections: {flag.sections_involved.join(', ')})
              </span>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  )
}
