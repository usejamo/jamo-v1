// src/components/__tests__/Step3AssumptionReview.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Step3AssumptionReview } from '../wizard/Step3AssumptionReview'
import type { WizardState, WizardAssumption, MissingField } from '../../types/wizard'

const makeAssumption = (overrides: Partial<WizardAssumption> = {}): WizardAssumption => ({
  id: 'a1',
  category: 'scope',
  value: 'Test assumption value',
  confidence: 'high',
  source: 'test-doc.pdf',
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

describe('Step3AssumptionReview', () => {
  it('REQ-3.4: renders assumption cards for each extracted assumption', () => {
    const state = makeState({
      assumptions: [
        makeAssumption({ id: 'a1', value: 'Assumption one' }),
        makeAssumption({ id: 'a2', value: 'Assumption two' }),
      ],
    })
    const dispatch = vi.fn()
    const { getAllByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    expect(getAllByTestId('assumption-card')).toHaveLength(2)
  })

  it('REQ-3.5: approve button sets assumption status to approved with green border', () => {
    const state = makeState({
      assumptions: [makeAssumption({ id: 'a1', status: 'pending' })],
    })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.click(getByTestId('approve-button'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { status: 'approved' },
    })
  })

  it('REQ-3.5: reject button sets assumption status to rejected with strikethrough', () => {
    const state = makeState({
      assumptions: [makeAssumption({ id: 'a1', status: 'pending' })],
    })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.click(getByTestId('reject-button'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { status: 'rejected' },
    })
  })

  it('REQ-3.5: clicking value text enables inline editing', () => {
    const state = makeState({
      assumptions: [makeAssumption({ id: 'a1', value: 'Original value' })],
    })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.click(getByTestId('assumption-value'))
    expect(getByTestId('assumption-value-input')).toBeTruthy()
    fireEvent.change(getByTestId('assumption-value-input'), { target: { value: 'Updated value' } })
    fireEvent.blur(getByTestId('assumption-value-input'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { value: 'Updated value' },
    })
  })

  it('REQ-3.5: Add assumption button appends blank card', () => {
    const state = makeState({ assumptions: [] })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.click(getByTestId('add-assumption-button'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_ASSUMPTION' })
  })

  it('REQ-3.7: missing fields section renders amber section above assumptions list', () => {
    const missingFields: MissingField[] = [
      { field: 'primary_endpoint', description: 'The primary study endpoint' },
    ]
    const state = makeState({ missingFields })
    const dispatch = vi.fn()
    const { getByTestId, getByText } = render(
      <Step3AssumptionReview state={state} dispatch={dispatch} />
    )
    expect(getByTestId('missing-fields-section')).toBeTruthy()
    expect(getByText(/Missing Information/)).toBeTruthy()
  })

  it('REQ-3.7: filling missing field and saving dispatches FILL_MISSING', () => {
    const missingFields: MissingField[] = [
      { field: 'primary_endpoint', description: 'The primary study endpoint' },
    ]
    const state = makeState({ missingFields })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    fireEvent.change(getByTestId('missing-field-input'), { target: { value: 'OS at 12 months' } })
    fireEvent.click(getByTestId('missing-field-save'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'FILL_MISSING',
      field: 'primary_endpoint',
      value: 'OS at 12 months',
    })
  })

  it('REQ-3.7: Next button shows count badge when missing fields remain unfilled', () => {
    const missingFields: MissingField[] = [
      { field: 'primary_endpoint', description: 'The primary endpoint' },
      { field: 'sample_size', description: 'Sample size' },
    ]
    const state = makeState({ missingFields })
    const dispatch = vi.fn()
    const { getByTestId } = render(<Step3AssumptionReview state={state} dispatch={dispatch} />)
    expect(getByTestId('next-button').textContent).toContain('2 missing')
  })
})
