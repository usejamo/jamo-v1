import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProposalCreationWizard } from '../ProposalCreationWizard'

const mockCloseModal = vi.fn()

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

describe('ProposalCreationWizard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('REQ-1.1: renders 3-step indicator with labels Study Info, Document Upload, Template & Generate', () => {
    render(<ProposalCreationWizard />)
    expect(screen.getByText('Study Info')).toBeTruthy()
    expect(screen.getByText('Document Upload')).toBeTruthy()
    expect(screen.getByText('Template & Generate')).toBeTruthy()
  })

  it.skip('REQ-1.2: Step 1 renders sponsor name, therapeutic area, indication, study phase fields', () => {})

  it.skip('REQ-1.2: Step 1 hard-required fields block forward navigation when empty', () => {})

  it('REQ-1.5: Skip to Fast Draft button jumps to Step 3 from Step 1', () => {
    render(<ProposalCreationWizard />)
    // Should start on step 0 — skip button visible
    const skipBtn = screen.getByTestId('skip-to-fast-draft')
    expect(skipBtn).toBeTruthy()
    fireEvent.click(skipBtn)
    // Now on step 2 — step-generate panel visible, skip button gone
    expect(screen.getByTestId('step-generate')).toBeTruthy()
    expect(screen.queryByTestId('skip-to-fast-draft')).toBeNull()
  })

  it('REQ-1.6: wizard state serialized to sessionStorage on skip', () => {
    render(<ProposalCreationWizard />)
    fireEvent.click(screen.getByTestId('skip-to-fast-draft'))
    const stored = sessionStorage.getItem('jamo-wizard-state')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).step).toBe(2)
  })

  it('REQ-1.6: wizard state hydrated from sessionStorage on mount', () => {
    // Pre-load step 2 into sessionStorage
    sessionStorage.setItem('jamo-wizard-state', JSON.stringify({
      step: 2,
      proposalId: null,
      studyInfo: { sponsorName: '', therapeuticArea: '', indication: '', studyPhase: '', regions: [], dueDate: '', services: [] },
      errors: {},
      submitting: false,
    }))
    render(<ProposalCreationWizard />)
    // Should start on step 2 (hydrated) — skip button not visible, step-generate visible
    expect(screen.getByTestId('step-generate')).toBeTruthy()
    expect(screen.queryByTestId('skip-to-fast-draft')).toBeNull()
  })

  it.skip('REQ-1.7: forward navigation blocked and errors shown when required fields are empty', () => {})

  it.skip('REQ-9.4: Step 3 renders Generate button and calls createProposal on click', () => {})
})
