import type { ToneOption } from '../types/generation'

interface GenerationControlsProps {
  tone: ToneOption
  onToneChange: (tone: ToneOption) => void
  isGenerating: boolean
  onGenerate: () => void
  hasCompleted: boolean
}

const TONE_OPTIONS: ToneOption[] = ['formal', 'regulatory', 'persuasive']

export function GenerationControls({
  tone,
  onToneChange,
  isGenerating,
  onGenerate,
  hasCompleted,
}: GenerationControlsProps) {
  return (
    <div className="flex flex-col md:flex-row items-center gap-3 mb-6">
      {/* Tone selector — 3-button toggle group */}
      <div
        className="flex rounded-lg border border-gray-200 overflow-hidden"
        role="group"
        aria-label="Tone selection"
      >
        {TONE_OPTIONS.map((t) => (
          <button
            key={t}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tone === t
                ? 'bg-jamo-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            onClick={() => onToneChange(t)}
            aria-pressed={tone === t}
            disabled={isGenerating}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Generate / Regenerate CTA */}
      <button
        className="px-6 py-2.5 bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-bold rounded-lg transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onGenerate}
        disabled={isGenerating}
        aria-busy={isGenerating}
      >
        {isGenerating ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generating\u2026
          </>
        ) : hasCompleted ? (
          'Regenerate All'
        ) : (
          'Generate Proposal'
        )}
      </button>
    </div>
  )
}

export default GenerationControls
