import type { WizardState, WizardAction, WizardAssumption } from '../types/wizard'
import { DEFAULT_WIZARD_STATE } from '../types/wizard'

// ── wizardReducer ────────────────────────────────────────────────────────────
//
// Moved verbatim out of ProposalCreationWizard.tsx in 16-08 (no behaviour
// change) so the demo run driver can reuse the REAL wizard reducer rather than
// reimplementing one. Importing it from the component would have dragged the
// modal/router/proposals contexts and all four step components into the hook.
//
// The demo drives this exact reducer with exactly these actions — D-01's "the
// demo is the real flow, fed from a fixture" only holds if the state machine is
// literally the same one.

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step, errors: {} }
    case 'SKIP_TO_GENERATE':
      return { ...state, step: 3, errors: {} }
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
    case 'SET_ASSUMPTIONS':
      return { ...state, assumptions: action.assumptions, missingFields: action.missing }
    case 'UPDATE_ASSUMPTION':
      return {
        ...state,
        assumptions: state.assumptions.map((a) =>
          a.id === action.id ? { ...a, ...action.updates } : a
        ),
      }
    case 'ADD_ASSUMPTION': {
      const newAssumption: WizardAssumption = {
        id: crypto.randomUUID(),
        category: 'scope',
        value: '',
        confidence: 'high',
        source: 'user-provided',
        status: 'pending',
      }
      return { ...state, assumptions: [...state.assumptions, newAssumption] }
    }
    case 'REMOVE_ASSUMPTION':
      return { ...state, assumptions: state.assumptions.filter((a) => a.id !== action.id) }
    case 'SET_DOCUMENT_COUNT':
      return { ...state, documentCount: action.count }
    case 'FILL_MISSING': {
      const filledAssumption: WizardAssumption = {
        id: crypto.randomUUID(),
        category: 'scope',
        value: action.value,
        confidence: 'high',
        source: 'user-provided',
        status: 'approved',
      }
      return {
        ...state,
        missingFields: state.missingFields.map((f) =>
          f.field === action.field ? { ...f, filledValue: action.value } : f
        ),
        assumptions: [...state.assumptions, filledAssumption],
      }
    }
    case 'SET_EXTRACTION_STATUS':
      return { ...state, extractionStatus: action.status }
    case 'SET_TEMPLATE':
      return { ...state, selectedTemplateId: action.templateId }
    default:
      return state
  }
}
