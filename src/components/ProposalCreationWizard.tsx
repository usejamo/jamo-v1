import { useReducer, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  WizardState,
  WizardAction,
  WizardAssumption,
} from '../types/wizard'
import {
  DEFAULT_WIZARD_STATE,
  WIZARD_STEPS,
} from '../types/wizard'
import { useProposalModal } from '../context/ProposalModalContext'
import { useProposals } from '../context/ProposalsContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { WizardStepIndicator } from './wizard/WizardStepIndicator'
import { Step1StudyInfo } from './wizard/Step1StudyInfo'
import { Step2DocumentUpload } from './wizard/Step2DocumentUpload'
import { Step3AssumptionReview } from './wizard/Step3AssumptionReview'
import { Step4Generate } from './wizard/Step4Generate'

const SESSION_KEY = 'jamo-wizard-state'

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
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

function getInitialState(): WizardState {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as WizardState
      if (parsed.stateVersion === 7) return parsed
    }
  } catch {
    // ignore
  }
  return DEFAULT_WIZARD_STATE
}

export function ProposalCreationWizard() {
  const { closeModal, isOpen } = useProposalModal()
  const { createProposal } = useProposals()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(wizardReducer, undefined, getInitialState)
  const prevStepRef = useRef(state.step)

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

  // Create draft proposal when entering step 1 (needed for document upload)
  useEffect(() => {
    if (state.step !== 1 || state.proposalId) return
    const { studyInfo } = state
    createProposal({
      title: `${studyInfo.sponsorName} — ${studyInfo.indication} (${studyInfo.studyPhase})`,
      client: studyInfo.sponsorName,
      therapeuticArea: studyInfo.therapeuticArea,
      studyType: studyInfo.studyPhase,
      indication: studyInfo.indication,
      dueDate: studyInfo.dueDate,
      status: 'draft',
      value: 0,
      description: JSON.stringify({ services: studyInfo.services, regions: studyInfo.regions }),
    }).then((id) => {
      dispatch({ type: 'SET_PROPOSAL_ID', id })
    }).catch((err) => {
      console.error('Failed to create draft proposal:', err)
    })
  }, [state.step, state.proposalId])

  // Persist approved assumptions to DB when transitioning from step 2 → step 3
  useEffect(() => {
    const prevStep = prevStepRef.current
    prevStepRef.current = state.step

    if (prevStep === 2 && state.step === 3 && state.proposalId && profile?.org_id) {
      const approvedAssumptions = state.assumptions.filter((a) => a.status === 'approved')
      if (approvedAssumptions.length > 0) {
        supabase
          .from('proposal_assumptions')
          .upsert(
            approvedAssumptions.map((a) => ({
              proposal_id: state.proposalId as string,
              org_id: profile.org_id,
              category: a.category,
              content: a.value,
              confidence: a.confidence,
              status: 'approved',
              user_edited: a.source === 'user-provided',
            }))
          )
          .then(({ error }) => {
            if (error) console.error('Failed to save assumptions:', error)
          })
      }
    }
  }, [state.step])

  function handleClose() {
    sessionStorage.removeItem(SESSION_KEY)
    dispatch({ type: 'RESET' })
    closeModal()
  }

  function handleStepClick(index: number) {
    dispatch({ type: 'SET_STEP', step: index as 0 | 1 | 2 | 3 })
  }

  async function handleGenerate() {
    dispatch({ type: 'SET_SUBMITTING', value: true })
    try {
      let id = state.proposalId
      if (!id) {
        const { studyInfo } = state
        id = await createProposal({
          title: `${studyInfo.sponsorName} — ${studyInfo.indication} (${studyInfo.studyPhase})`,
          client: studyInfo.sponsorName,
          therapeuticArea: studyInfo.therapeuticArea,
          studyType: studyInfo.studyPhase,
          indication: studyInfo.indication,
          dueDate: studyInfo.dueDate,
          status: 'draft',
          value: 0,
          description: JSON.stringify({ services: studyInfo.services, regions: studyInfo.regions }),
        })
      }

      // D-04: Save selected template and pre-create proposal_sections before generation
      const templateId = state.selectedTemplateId ?? '00000000-0000-0000-0000-000000000001'

      // Save selected_template_id to proposal row
      await supabase
        .from('proposals')
        .update({ selected_template_id: templateId })
        .eq('id', id)

      // Fetch template sections ordered by position
      const { data: templateSections, error: tsError } = await supabase
        .from('template_sections')
        .select('id, name, description, role, position')
        .eq('template_id', templateId)
        .order('position', { ascending: true })

      if (tsError || !templateSections || templateSections.length === 0) {
        console.error('[ProposalCreationWizard] Failed to fetch template sections:', tsError)
        // Fall through — ProposalDetail will handle missing sections gracefully
      } else {
        // Insert proposal_sections rows (all status = 'pending')
        const sectionInserts = templateSections.map((ts) => ({
          proposal_id: id,
          org_id: profile?.org_id ?? null,
          name: ts.name,
          description: ts.description ?? null,
          role: ts.role ?? null,
          position: ts.position,
          section_key: ts.role ?? `section-${ts.position}`,
          section_name: ts.name,
          status: 'pending',
          content: '',
        }))
        const { error: insertError } = await supabase
          .from('proposal_sections')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(sectionInserts as any[], { onConflict: 'proposal_id,section_key' })
        if (insertError) {
          console.error('[ProposalCreationWizard] Failed to create proposal sections:', insertError)
        }
      }

      sessionStorage.removeItem(SESSION_KEY)
      closeModal()
      navigate(`/proposals/${id}?generate=true`)
    } catch (err) {
      console.error('Failed to create proposal:', err)
      dispatch({ type: 'SET_SUBMITTING', value: false })
    }
  }

  return (
    <div data-testid="proposal-creation-wizard" className="flex flex-col max-h-[90vh]">
      <WizardStepIndicator
        steps={WIZARD_STEPS}
        currentStep={state.step}
        onStepClick={handleStepClick}
      />

      {state.step === 0 && (
        <div className="flex justify-end px-6 pt-3">
          <button
            type="button"
            data-testid="skip-to-fast-draft"
            onClick={() => dispatch({ type: 'SKIP_TO_GENERATE' })}
            title="Skip Upload and Assumption Review"
            className="text-xs text-jamo-500 hover:text-jamo-700 underline"
          >
            Skip to Fast Draft
          </button>
        </div>
      )}

      <div className="px-6 py-4 overflow-y-auto flex-1">
        {state.step === 0 && (
          <div data-testid="step-study-info">
            <Step1StudyInfo state={state} dispatch={dispatch} />
          </div>
        )}
        {state.step === 1 && (
          <Step2DocumentUpload state={state} dispatch={dispatch} />
        )}
        {state.step === 2 && (
          <Step3AssumptionReview state={state} dispatch={dispatch} />
        )}
        {state.step === 3 && (
          <Step4Generate state={state} dispatch={dispatch} onGenerate={handleGenerate} />
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
