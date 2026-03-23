import type { WizardState, WizardAction } from '../../types/wizard'

interface Step2DocumentUploadProps {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
}

export function Step2DocumentUpload({ state, dispatch }: Step2DocumentUploadProps) {
  return (
    <div className="space-y-5" data-testid="step-document-upload">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Upload Documents</h3>
        <p className="mt-1 text-sm text-gray-500">
          Upload your RFP, protocol, budget, or other study documents. These will be associated
          with your proposal after creation.
        </p>
      </div>

      {state.proposalId ? (
        <p className="text-xs text-gray-400">
          Documents can be uploaded from the proposal detail page.
        </p>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-200 px-6 py-8 text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-600">Documents upload after proposal creation</p>
          <p className="mt-1 text-xs text-gray-400">
            Proceed to Generate — you can upload RFP, protocol, and budget files from the proposal
            detail page once the record is created.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}
          className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          data-testid="next-button"
          onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
          className="rounded-md bg-jamo-500 px-5 py-2 text-sm font-medium text-white hover:bg-jamo-600"
        >
          Next
        </button>
      </div>
    </div>
  )
}
