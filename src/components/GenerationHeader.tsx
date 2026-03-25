import { motion } from 'framer-motion'
import type { WaveNumber } from '../types/generation'

interface GenerationHeaderProps {
  isGenerating: boolean
  currentWave: WaveNumber | null
  completedCount: number
  totalCount: number
}

function isWaveComplete(wave: WaveNumber, currentWave: WaveNumber | null, isGenerating: boolean): boolean {
  if (!currentWave) return false
  if (isGenerating) return wave < currentWave
  // Generation finished — all waves complete
  return true
}

function isWaveActive(wave: WaveNumber, currentWave: WaveNumber | null, isGenerating: boolean): boolean {
  return isGenerating && currentWave === wave
}

interface WaveCircleProps {
  wave: WaveNumber
  active: boolean
  complete: boolean
}

function WaveCircle({ wave, active, complete }: WaveCircleProps) {
  const baseClass = 'w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center'
  const className = complete
    ? `${baseClass} bg-green-500 text-white`
    : active
    ? `${baseClass} bg-jamo-500 text-white`
    : `${baseClass} border-2 border-gray-200 text-gray-400`

  return (
    <motion.div
      className={className}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {complete ? (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        wave
      )}
    </motion.div>
  )
}

interface ConnectorProps {
  complete: boolean
}

function Connector({ complete }: ConnectorProps) {
  return (
    <div className={`h-0.5 w-8 ${complete ? 'bg-green-300' : 'bg-gray-200'}`} />
  )
}

function WaveProgressIndicator({
  currentWave,
  completedCount,
  totalCount,
  isGenerating,
}: {
  currentWave: WaveNumber | null
  completedCount: number
  totalCount: number
  isGenerating: boolean
}) {
  const waves: WaveNumber[] = [1, 2, 3]
  const allComplete = !isGenerating && completedCount === totalCount && totalCount > 0

  return (
    <div className="flex items-center">
      {waves.map((wave, idx) => {
        const complete = allComplete || isWaveComplete(wave, currentWave, isGenerating)
        const active = !allComplete && isWaveActive(wave, currentWave, isGenerating)
        return (
          <div key={wave} className="flex items-center">
            <WaveCircle wave={wave} active={active} complete={complete} />
            {idx < waves.length - 1 && (
              <Connector complete={allComplete || (currentWave !== null && wave < currentWave)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function GenerationHeader({
  isGenerating,
  currentWave,
  completedCount,
  totalCount,
}: GenerationHeaderProps) {
  const headingText = isGenerating
    ? 'Generating Proposal'
    : completedCount === totalCount && totalCount > 0
    ? `${totalCount} sections complete. Review your proposal below.`
    : 'Ready to generate'

  const subText = isGenerating
    ? currentWave === 1
      ? 'Generating foundation section\u2026'
      : currentWave === 2
      ? 'Generating body sections in parallel\u2026'
      : 'Generating summary sections\u2026'
    : completedCount > 0
    ? `${completedCount} of ${totalCount} sections complete`
    : 'Review your tone selection, then click Generate Proposal to begin.'

  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{headingText}</h2>
        <p className="text-sm text-gray-500 mt-1">{subText}</p>
      </div>
      <WaveProgressIndicator
        currentWave={currentWave}
        completedCount={completedCount}
        totalCount={totalCount}
        isGenerating={isGenerating}
      />
    </div>
  )
}

export default GenerationHeader
