import { motion } from 'framer-motion'

interface GenerationHeaderProps {
  isGenerating: boolean
  completedCount: number
  totalCount: number
}

function ProgressBar({ completedCount, totalCount, isGenerating }: { completedCount: number; totalCount: number; isGenerating: boolean }) {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  return (
    <div className="w-48">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{completedCount} of {totalCount} sections</span>
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
}: GenerationHeaderProps) {
  const headingText = isGenerating
    ? 'Generating Proposal'
    : completedCount === totalCount && totalCount > 0
    ? `${totalCount} sections complete. Review your proposal below.`
    : 'Ready to generate'

  const subText = isGenerating
    ? `Generating section ${completedCount + 1} of ${totalCount}\u2026`
    : completedCount > 0
    ? `${completedCount} of ${totalCount} sections complete`
    : 'Review your tone selection, then click Generate Proposal to begin.'

  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{headingText}</h2>
        <p className="text-sm text-gray-500 mt-1">{subText}</p>
      </div>
      {totalCount > 0 && (
        <ProgressBar completedCount={completedCount} totalCount={totalCount} isGenerating={isGenerating} />
      )}
    </div>
  )
}

export default GenerationHeader
