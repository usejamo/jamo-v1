import type { WizardState, WizardAction } from '../../types/wizard'

interface Step3GenerateProps {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
  onGenerate: () => Promise<void>
}

function getOutputQuality(hasStudyInfo: boolean, documentCount: number): 'full' | 'reduced' | 'limited' {
  if (hasStudyInfo && documentCount > 0) return 'full'
  if (hasStudyInfo || documentCount > 0) return 'reduced'
  return 'limited'
}

function ContextSummary({ state }: { state: WizardState }) {
  const { studyInfo } = state
  const hasStudyInfo = Boolean(studyInfo.sponsorName && studyInfo.therapeuticArea)
  const documentCount = 0 // Phase 5: documents uploaded post-creation
  const quality = getOutputQuality(hasStudyInfo, documentCount)

  const qualityLabel: Record<typeof quality, string> = {
    full: 'Full quality output expected',
    reduced: 'Reduced quality — add more context for better results',
    limited: 'Limited quality — study info and documents improve output',
  }

  const qualityColor: Record<typeof quality, string> = {
    full: 'text-green-500',
    reduced: 'text-yellow-500',
    limited: 'text-gray-400',
  }

  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3 space-y-2" data-testid="context-summary">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Context Summary</p>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${hasStudyInfo ? 'text-gray-700' : 'text-gray-400'}`}>
          {hasStudyInfo
            ? `Study info: ${studyInfo.sponsorName} / ${studyInfo.therapeuticArea}`
            : 'Study info: not provided'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">
          Documents: {documentCount} (upload after creation)
        </span>
      </div>
      <p className={`text-xs ${qualityColor[quality]}`}>{qualityLabel[quality]}</p>
    </div>
  )
}

export function Step3Generate({ state, dispatch, onGenerate }: Step3GenerateProps) {
  return (
    <div className="space-y-5" data-testid="step-generate">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Template &amp; Generate</h3>
        <p className="mt-1 text-sm text-gray-500">
          Review your context and generate the proposal.
        </p>
      </div>

      <ContextSummary state={state} />

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}
          className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          data-testid="generate-button"
          onClick={onGenerate}
          disabled={state.submitting}
          className="inline-flex items-center gap-2 rounded-md bg-jamo-500 px-5 py-2 text-sm font-medium text-white hover:bg-jamo-600 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {state.submitting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Creating...
            </>
          ) : (
            'Generate Proposal'
          )}
        </button>
      </div>
    </div>
  )
}
