import { useReducer, useEffect } from 'react'
import {
  WizardState,
  WizardAction,
  DEFAULT_WIZARD_STATE,
  WIZARD_STEPS,
} from '../types/wizard'
import { useProposalModal } from '../context/ProposalModalContext'
import { WizardStepIndicator } from './wizard/WizardStepIndicator'

const SESSION_KEY = 'jamo-wizard-state'

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step, errors: {} }
    case 'SKIP_TO_GENERATE':
      return { ...state, step: 2, errors: {} }
    case 'UPDATE_STUDY_INFO':
      return {
        ...state,
        studyInfo: { ...state.studyInfo, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: undefined },
      }
    case 'TOGGLE_SERVICE': {
      const current = state.studyInfo.services
      const next = current.includes(action.label)
        ? current.filter((s) => s !== action.label)
        : [...current, action.label]
      return { ...state, studyInfo: { ...state.studyInfo, services: next } }
    }
    case 'SET_ERRORS':
      return { ...state, errors: action.errors }
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.value }
    case 'SET_PROPOSAL_ID':
      return { ...state, proposalId: action.id }
    case 'RESET':
      return DEFAULT_WIZARD_STATE
    default:
      return state
  }
}

function getInitialState(): WizardState {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) return JSON.parse(stored) as WizardState
  } catch {
    // ignore
  }
  return DEFAULT_WIZARD_STATE
}

export function ProposalCreationWizard() {
  const { closeModal, isOpen } = useProposalModal()
  const [state, dispatch] = useReducer(wizardReducer, undefined, getInitialState)

  // Persist state to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state])

  // Reset and clear sessionStorage when modal reopens
  useEffect(() => {
    if (isOpen) {
      dispatch({ type: 'RESET' })
      sessionStorage.removeItem(SESSION_KEY)
    }
  }, [isOpen])

  function handleClose() {
    sessionStorage.removeItem(SESSION_KEY)
    dispatch({ type: 'RESET' })
    closeModal()
  }

  function handleStepClick(index: number) {
    dispatch({ type: 'SET_STEP', step: index as 0 | 1 | 2 })
  }

  return (
    <div data-testid="proposal-creation-wizard">
      <WizardStepIndicator
        steps={WIZARD_STEPS}
        currentStep={state.step}
        onStepClick={handleStepClick}
      />

      {state.step < 2 && (
        <div className="flex justify-end px-6 pt-3">
          <button
            type="button"
            data-testid="skip-to-fast-draft"
            onClick={() => dispatch({ type: 'SKIP_TO_GENERATE' })}
            className="text-xs text-jamo-500 hover:text-jamo-700 underline"
          >
            Skip to Fast Draft
          </button>
        </div>
      )}

      <div className="px-6 py-4">
        {state.step === 0 && (
          <div data-testid="step-study-info">
            {/* Step 1: Study Info — filled in Plan 03 */}
          </div>
        )}
        {state.step === 1 && (
          <div data-testid="step-document-upload">
            {/* Step 2: Document Upload — filled in Plan 04 */}
          </div>
        )}
        {state.step === 2 && (
          <div data-testid="step-generate">
            {/* Step 3: Template & Generate — filled in Plan 04 */}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 px-6 pb-5">
        <button
          type="button"
          onClick={handleClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
