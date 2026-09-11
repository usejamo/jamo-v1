// src/components/__tests__/Step1StudyInfo.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Step1StudyInfo } from '../wizard/Step1StudyInfo'
import type { WizardState, StudyInfo } from '../../types/wizard'

function makeState(overrides: Partial<StudyInfo> = {}): WizardState {
  return {
    step: 0,
    proposalId: null,
    studyInfo: {
      sponsorName: '',
      therapeuticArea: '',
      indication: '',
      investigationalProduct: '',
      investigationalProductUndisclosed: false,
      studyPhase: '',
      regions: [],
      dueDate: '',
      services: [],
      ...overrides,
    },
    errors: {},
    submitting: false,
    assumptions: [],
    missingFields: [],
    extractionStatus: 'idle',
    documentCount: 0,
    selectedTemplateId: null,
    stateVersion: 9,
  }
}

describe('Step1StudyInfo — Drug Discovery option', () => {
  it('lists Drug Discovery first in the Study Phase dropdown, before Phase I', () => {
    render(<Step1StudyInfo state={makeState()} dispatch={vi.fn()} />)
    const select = screen.getByLabelText('Study Phase') as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    // labels[0] is the "Select study phase…" placeholder
    expect(labels[1]).toBe('Drug Discovery')
    expect(labels[2]).toBe('Phase I (First-in-Human)')
  })
})

describe('Step1StudyInfo — Study Phase Other', () => {
  it('adds Other as the last Study Phase option', () => {
    render(<Step1StudyInfo state={makeState()} dispatch={vi.fn()} />)
    const select = screen.getByLabelText('Study Phase') as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels[labels.length - 1]).toBe('Other')
  })

  it('reveals a freetext input and clears the value when Other is selected', () => {
    const dispatch = vi.fn()
    render(<Step1StudyInfo state={makeState({ studyPhase: 'Phase II' })} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText('Study Phase'), { target: { value: 'Other' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_STUDY_INFO', field: 'studyPhase', value: '' })
    expect(screen.getByLabelText('Custom Study Phase')).toBeTruthy()
  })

  it('dispatches typed text directly as the Study Phase value, not the literal "Other"', () => {
    const dispatch = vi.fn()
    render(<Step1StudyInfo state={makeState({ studyPhase: 'Phase II' })} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText('Study Phase'), { target: { value: 'Other' } })
    fireEvent.change(screen.getByLabelText('Custom Study Phase'), { target: { value: 'Adaptive Basket Design' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_STUDY_INFO', field: 'studyPhase', value: 'Adaptive Basket Design' })
  })

  it('shows Study Phase as Other with the value pre-filled when the persisted value is not a preset option', () => {
    render(<Step1StudyInfo state={makeState({ studyPhase: 'Adaptive Basket Design' })} dispatch={vi.fn()} />)
    const select = screen.getByLabelText('Study Phase') as HTMLSelectElement
    expect(select.value).toBe('Other')
    expect((screen.getByLabelText('Custom Study Phase') as HTMLInputElement).value).toBe('Adaptive Basket Design')
  })
})
