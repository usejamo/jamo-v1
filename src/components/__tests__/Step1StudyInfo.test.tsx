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

describe('Step1StudyInfo — Therapeutic Area Other', () => {
  it('adds Other as the last Therapeutic Area option', () => {
    render(<Step1StudyInfo state={makeState()} dispatch={vi.fn()} />)
    const select = screen.getByLabelText('Therapeutic Area') as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels[labels.length - 1]).toBe('Other')
  })

  it('reveals a freetext input and clears the value when Other is selected', () => {
    const dispatch = vi.fn()
    render(<Step1StudyInfo state={makeState({ therapeuticArea: 'Cardiovascular' })} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText('Therapeutic Area'), { target: { value: 'Other' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_STUDY_INFO', field: 'therapeuticArea', value: '' })
    expect(screen.getByLabelText('Custom Therapeutic Area')).toBeTruthy()
  })

  it('dispatches typed text directly as the Therapeutic Area value, not the literal "Other"', () => {
    const dispatch = vi.fn()
    render(<Step1StudyInfo state={makeState({ therapeuticArea: 'Cardiovascular' })} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText('Therapeutic Area'), { target: { value: 'Other' } })
    fireEvent.change(screen.getByLabelText('Custom Therapeutic Area'), { target: { value: 'Rare Pediatric Metabolic Disorder' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_STUDY_INFO', field: 'therapeuticArea', value: 'Rare Pediatric Metabolic Disorder' })
  })

  it('shows Therapeutic Area as Other with the value pre-filled when the persisted value is not a preset option', () => {
    render(<Step1StudyInfo state={makeState({ therapeuticArea: 'Rare Pediatric Metabolic Disorder' })} dispatch={vi.fn()} />)
    const select = screen.getByLabelText('Therapeutic Area') as HTMLSelectElement
    expect(select.value).toBe('Other')
    expect((screen.getByLabelText('Custom Therapeutic Area') as HTMLInputElement).value).toBe('Rare Pediatric Metabolic Disorder')
  })
})

describe('Step1StudyInfo — Required field validation with whitespace', () => {
  it('rejects whitespace-only Study Phase value and dispatches Required error', () => {
    const dispatch = vi.fn()
    render(
      <Step1StudyInfo
        state={makeState({ studyPhase: '   ' })}
        dispatch={dispatch}
      />
    )
    fireEvent.click(screen.getByTestId('next-button'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ERRORS',
      errors: expect.objectContaining({ studyPhase: 'Required' }),
    })
  })

  it('rejects whitespace-only Therapeutic Area value and dispatches Required error', () => {
    const dispatch = vi.fn()
    render(
      <Step1StudyInfo
        state={makeState({ therapeuticArea: '   ' })}
        dispatch={dispatch}
      />
    )
    fireEvent.click(screen.getByTestId('next-button'))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ERRORS',
      errors: expect.objectContaining({ therapeuticArea: 'Required' }),
    })
  })

  it('accepts non-whitespace Study Phase and proceeds without Required error', () => {
    const dispatch = vi.fn()
    render(
      <Step1StudyInfo
        state={makeState({
          sponsorName: 'Pharma Inc',
          therapeuticArea: 'Oncology',
          indication: 'Cancer',
          studyPhase: 'Phase II',
        })}
        dispatch={dispatch}
      />
    )
    fireEvent.click(screen.getByTestId('next-button'))
    // Verify SET_ERRORS was not called (or if it was, studyPhase is not in it)
    const errorCalls = dispatch.mock.calls.filter((c) => c[0].type === 'SET_ERRORS')
    if (errorCalls.length > 0) {
      expect(errorCalls[0][0].errors.studyPhase).toBeUndefined()
    }
  })
})
