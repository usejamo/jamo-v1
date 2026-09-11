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
