import { motion } from 'framer-motion'

interface GenerationHeaderProps {
  isGenerating: boolean
  completedCount: number
  totalCount: number
  onStop?: () => void
}

function ProgressBar({ completedCount, totalCount, isGenerating }: { completedCount: number; totalCount: number; isGenerating: boolean }) {
  const safeCompleted = Math.min(completedCount, totalCount)
  const pct = totalCount > 0 ? Math.min(Math.round((safeCompleted / totalCount) * 100), 100) : 0
  return (
    <div className="w-48">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{safeCompleted} of {totalCount} sections</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isGenerating ? 'bg-jamo-500' : 'bg-green-500'}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export function GenerationHeader({
  isGenerating,
  completedCount,
  totalCount,
  onStop,
}: GenerationHeaderProps) {
  const safeCompleted = Math.min(completedCount, totalCount)

  const headingText = isGenerating
    ? 'Generating Proposal'
    : safeCompleted === totalCount && totalCount > 0
    ? `${totalCount} sections complete. Review your proposal below.`
    : 'Ready to generate'

  const subText = isGenerating
    ? `Generating section ${Math.min(safeCompleted + 1, totalCount)} of ${totalCount}\u2026`
    : safeCompleted > 0
    ? `${safeCompleted} of ${totalCount} sections complete`
    : 'Review your tone selection, then click Generate Proposal to begin.'

  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{headingText}</h2>
        <p className="text-sm text-gray-500 mt-1">{subText}</p>
      </div>
      {totalCount > 0 && (
        <div className="flex items-center gap-3">
          {isGenerating && onStop && (
            <button
              onClick={onStop}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-800 transition-colors"
            >
              Stop
            </button>
          )}
          <ProgressBar completedCount={completedCount} totalCount={totalCount} isGenerating={isGenerating} />
        </div>
      )}
    </div>
  )
}

export default GenerationHeader
