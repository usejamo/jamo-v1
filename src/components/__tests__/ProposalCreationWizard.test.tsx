import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProposalCreationWizard } from '../ProposalCreationWizard'

const mockCloseModal = vi.fn()
const mockCreateProposal = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../../lib/supabase', () => {
  const mockChain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn((resolve: (value: { data: any[]; error: null }) => void) => {
      resolve({ data: [], error: null })
      return Promise.resolve({ data: [], error: null })
    }),
  }
  // Make the chain thenable so async callers get { data: [], error: null }
  Object.defineProperty(mockChain, Symbol.toStringTag, { value: 'Promise' })
  const thenableChain = new Proxy(mockChain, {
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return Promise.resolve({ data: [], error: null })[prop as 'then'].bind(
          Promise.resolve({ data: [], error: null })
        )
      }
      return target[prop]
    },
  })
  return {
    supabase: {
      from: vi.fn().mockReturnValue(thenableChain),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { assumptions: [], missing: [] }, error: null }),
      },
    },
  }
})

vi.mock('../../context/ProposalModalContext', () => ({
  useProposalModal: vi.fn(() => ({
    closeModal: mockCloseModal,
    isOpen: false,
    openModal: vi.fn(),
    modalProposal: undefined,
    toast: null,
    showToast: vi.fn(),
  })),
}))

vi.mock('../../context/ProposalsContext', () => ({
  useProposals: vi.fn(() => ({
    proposals: [],
    loading: false,
    error: null,
    createProposal: mockCreateProposal,
    updateProposal: vi.fn(),
    permanentlyDelete: vi.fn(),
  })),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    session: null,
    user: null,
    profile: { org_id: 'org-1', id: 'user-1', role: 'admin', full_name: 'Test User' },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
  })),
}))

describe('ProposalCreationWizard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('REQ-1.1: renders 4-step indicator with labels Study Info, Document Upload, Assumption Review, Template & Generate', () => {
    render(<ProposalCreationWizard />)
    expect(screen.getByText('Study Info')).toBeTruthy()
    expect(screen.getByText('Document Upload')).toBeTruthy()
    expect(screen.getByText('Assumption Review')).toBeTruthy()
    expect(screen.getByText('Template & Generate')).toBeTruthy()
  })

  it('REQ-1.2: Step 1 renders sponsor name, therapeutic area, indication, study phase fields', () => {
    render(<ProposalCreationWizard />)
    // Required fields
    expect(screen.getByLabelText('Sponsor Name')).toBeTruthy()
    expect(screen.getByLabelText('Therapeutic Area')).toBeTruthy()
    expect(screen.getByLabelText('Indication')).toBeTruthy()
    expect(screen.getByLabelText('Study Phase')).toBeTruthy()
    // Optional fields
    expect(screen.getByLabelText('Proposal Due Date')).toBeTruthy()
    expect(screen.getByLabelText('Countries / Regions')).toBeTruthy()
  })

  it('REQ-1.2: Step 1 hard-required fields block forward navigation when empty', () => {
    render(<ProposalCreationWizard />)
    const nextBtn = screen.getByTestId('next-button')
    fireEvent.click(nextBtn)
    // Still on step 0 — step-study-info still visible
    expect(screen.getByTestId('step-study-info')).toBeTruthy()
    // Inline errors shown for required fields
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(4)
  })

  it('REQ-1.5: Skip to Fast Draft button jumps to Step 4 (Generate) from Step 1', () => {
    render(<ProposalCreationWizard />)
    // Should start on step 0 — skip button visible
    const skipBtn = screen.getByTestId('skip-to-fast-draft')
    expect(skipBtn).toBeTruthy()
    fireEvent.click(skipBtn)
    // Now on step 3 — step-generate panel visible, skip button gone
    expect(screen.getByTestId('step-generate')).toBeTruthy()
    expect(screen.queryByTestId('skip-to-fast-draft')).toBeNull()
  })

  it('REQ-1.6: wizard state serialized to sessionStorage on skip', () => {
    render(<ProposalCreationWizard />)
    fireEvent.click(screen.getByTestId('skip-to-fast-draft'))
    const stored = sessionStorage.getItem('jamo-wizard-state')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).step).toBe(3)
  })

  it('REQ-1.6: wizard state hydrated from sessionStorage on mount when stateVersion matches', () => {
    // Pre-load step 3 into sessionStorage with stateVersion:7
    sessionStorage.setItem('jamo-wizard-state', JSON.stringify({
      step: 3,
      proposalId: null,
      studyInfo: { sponsorName: '', therapeuticArea: '', indication: '', studyPhase: '', regions: [], dueDate: '', services: [] },
      errors: {},
      submitting: false,
      assumptions: [],
      missingFields: [],
      extractionStatus: 'idle',
      selectedTemplateId: null,
      stateVersion: 7,
    }))
    render(<ProposalCreationWizard />)
    // Should start on step 3 (hydrated) — skip button not visible, step-generate visible
    expect(screen.getByTestId('step-generate')).toBeTruthy()
    expect(screen.queryByTestId('skip-to-fast-draft')).toBeNull()
  })

  it('REQ-1.6: stale sessionStorage without stateVersion:6 resets to step 0', () => {
    // Pre-load old shape without stateVersion
    sessionStorage.setItem('jamo-wizard-state', JSON.stringify({
      step: 3,
      proposalId: null,
      studyInfo: { sponsorName: '', therapeuticArea: '', indication: '', studyPhase: '', regions: [], dueDate: '', services: [] },
      errors: {},
      submitting: false,
    }))
    render(<ProposalCreationWizard />)
    // Should reset to step 0 — study info visible
    expect(screen.getByTestId('step-study-info')).toBeTruthy()
  })

  it('REQ-1.7: forward navigation blocked and errors shown when required fields are empty', () => {
    render(<ProposalCreationWizard />)
    const nextBtn = screen.getByTestId('next-button')
    fireEvent.click(nextBtn)
    // Errors appear inline under each required field
    const errors = screen.getAllByText('Required')
    expect(errors.length).toBeGreaterThanOrEqual(4)
    // Step does not advance
    expect(screen.getByTestId('step-study-info')).toBeTruthy()
  })

  it('REQ-3.3: step===2 renders Step3AssumptionReview (not placeholder div)', () => {
    sessionStorage.setItem('jamo-wizard-state', JSON.stringify({
      step: 2,
      proposalId: null,
      studyInfo: { sponsorName: '', therapeuticArea: '', indication: '', studyPhase: '', regions: [], dueDate: '', services: [] },
      errors: {},
      submitting: false,
      assumptions: [],
      missingFields: [],
      extractionStatus: 'idle',
      selectedTemplateId: null,
      stateVersion: 7,
    }))
    render(<ProposalCreationWizard />)
    // Step3AssumptionReview has data-testid="step-assumption-review"
    expect(screen.getByTestId('step-assumption-review')).toBeTruthy()
    // The placeholder text must NOT be present
    expect(screen.queryByText(/coming in Plan 03/)).toBeNull()
  })

  it('REQ-9.4: Step 4 renders Generate button and calls createProposal on click', async () => {
    mockCreateProposal.mockResolvedValueOnce('proposal-123')
    // Pre-load step 3 into sessionStorage with stateVersion:7
    sessionStorage.setItem('jamo-wizard-state', JSON.stringify({
      step: 3,
      proposalId: null,
      studyInfo: {
        sponsorName: 'Pfizer',
        therapeuticArea: 'Oncology',
        indication: 'NSCLC',
        studyPhase: 'Phase II',
        regions: [],
        dueDate: '',
        services: [],
      },
      errors: {},
      submitting: false,
      assumptions: [],
      missingFields: [],
      extractionStatus: 'idle',
      selectedTemplateId: null,
      stateVersion: 7,
    }))
    render(<ProposalCreationWizard />)
    const generateBtn = screen.getByTestId('generate-button')
    expect(generateBtn).toBeTruthy()
    fireEvent.click(generateBtn)
    // createProposal called with wizard payload
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Pfizer — NSCLC (Phase II)',
        client: 'Pfizer',
        therapeuticArea: 'Oncology',
        status: 'draft',
      })
    )
  })
})
