// src/components/__tests__/AssumptionCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Step3AssumptionReview } from '../wizard/Step3AssumptionReview'
import type { WizardState, WizardAssumption } from '../../types/wizard'

const makeAssumption = (overrides: Partial<WizardAssumption> = {}): WizardAssumption => ({
  id: 'a1',
  category: 'scope',
  value: 'Test assumption',
  confidence: 'high',
  source: 'doc.pdf',
  status: 'pending',
  ...overrides,
})

const makeState = (overrides: Partial<WizardState> = {}): WizardState => ({
  step: 2,
  stateVersion: 6,
  proposalId: null,
  studyInfo: {
    sponsorName: '',
    therapeuticArea: '',
    indication: '',
    studyPhase: '',
    regions: [],
    dueDate: '',
    services: [],
  },
  errors: {},
  submitting: false,
  assumptions: [],
  missingFields: [],
  extractionStatus: 'idle',
  ...overrides,
})

describe('AssumptionCard', () => {
  it('REQ-3.3: renders High confidence badge in green for confidence >= 0.8', () => {
    const state = makeState({ assumptions: [makeAssumption({ confidence: 'high' })] })
    const dispatch = vi.fn()
    const { getByText } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    const badge = getByText('High')
    expect(badge.className).toContain('bg-green-100')
  })

  it('REQ-3.3: renders Medium confidence badge in yellow for confidence 0.5-0.79', () => {
    const state = makeState({ assumptions: [makeAssumption({ confidence: 'medium' })] })
    const dispatch = vi.fn()
    const { getByText } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    const badge = getByText('Medium')
    expect(badge.className).toContain('bg-yellow-100')
  })

  it('REQ-3.3: renders Low confidence badge in red for confidence < 0.5', () => {
    const state = makeState({ assumptions: [makeAssumption({ confidence: 'low' })] })
    const dispatch = vi.fn()
    const { getByText } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    const badge = getByText('Low')
    expect(badge.className).toContain('bg-red-100')
  })

  it('REQ-3.5: approve toggles card to green border state', () => {
    const state = makeState({ assumptions: [makeAssumption({ id: 'a1', status: 'pending' })] })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.click(getByTestId('approve-button'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { status: 'approved' },
    })
  })

  it('REQ-3.5: reject toggles card to gray strikethrough state', () => {
    const state = makeState({ assumptions: [makeAssumption({ id: 'a1', status: 'pending' })] })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.click(getByTestId('reject-button'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { status: 'rejected' },
    })
  })

  it('REQ-3.5: rejected card can be un-rejected by clicking approve again', () => {
    const state = makeState({ assumptions: [makeAssumption({ id: 'a1', status: 'rejected' })] })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.click(getByTestId('approve-button'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { status: 'approved' },
    })
  })
})

describe('AssumptionCard category selector', () => {
  it('renders the category as a select, not a static label', () => {
    const state = makeState({ assumptions: [makeAssumption({ category: 'timeline' })] })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    const select = getByTestId('assumption-category-select') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('timeline')
  })

  it('offers all five categories with human-readable labels', () => {
    const state = makeState({ assumptions: [makeAssumption()] })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    const select = getByTestId('assumption-category-select') as HTMLSelectElement
    const options = Array.from(select.options)
    expect(options.map((o) => o.value)).toEqual([
      'sponsor_metadata',
      'scope',
      'timeline',
      'budget',
      'criteria',
    ])
    expect(options.map((o) => o.textContent)).toEqual([
      'Sponsor Info',
      'Scope',
      'Timeline',
      'Budget',
      'Eligibility Criteria',
    ])
  })

  it('dispatches UPDATE_ASSUMPTION when the category is changed', () => {
    const state = makeState({ assumptions: [makeAssumption({ id: 'a1', category: 'scope' })] })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.change(getByTestId('assumption-category-select'), {
      target: { value: 'budget' },
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { category: 'budget' },
    })
  })

  it('is available on extracted assumptions, not just user-added ones', () => {
    const state = makeState({
      assumptions: [makeAssumption({ id: 'a1', source: 'protocol.pdf', category: 'criteria' })],
    })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    const select = getByTestId('assumption-category-select') as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(select.value).toBe('criteria')
  })
})
