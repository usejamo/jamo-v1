// src/lib/__tests__/wizardReducer.test.ts
//
// Assumption category is NOT display-only: generate-proposal-section's
// promptAssembly interpolates it into the LLM prompt as `- [${category}] ${content}`
// under "## EXTRACTED ASSUMPTIONS". A wrong category is a wrong word in the prompt,
// so these tests pin the taxonomy and the two sites that used to invent 'scope'.
import { describe, it, expect } from 'vitest'
import { wizardReducer, humanizeFieldName } from '../wizardReducer'
import { DEFAULT_WIZARD_STATE, ASSUMPTION_CATEGORIES, coerceAssumptionCategory } from '../../types/wizard'
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
  ...DEFAULT_WIZARD_STATE,
  ...overrides,
})

describe('assumption category taxonomy', () => {
  it('is exactly the five values the extractor produces and production uses', () => {
    expect([...ASSUMPTION_CATEGORIES]).toEqual([
      'sponsor_metadata',
      'scope',
      'timeline',
      'budget',
      'criteria',
    ])
  })

  it('coerces every known category to itself', () => {
    for (const c of ASSUMPTION_CATEGORIES) {
      expect(coerceAssumptionCategory(c)).toBe(c)
    }
  })

  it('coerces case and whitespace variants an LLM might emit', () => {
    expect(coerceAssumptionCategory('Timeline')).toBe('timeline')
    expect(coerceAssumptionCategory('  BUDGET  ')).toBe('budget')
    expect(coerceAssumptionCategory('Sponsor_Metadata')).toBe('sponsor_metadata')
  })

  it('falls back to scope for unknown, null, or non-string input rather than throwing', () => {
    // extract-assumptions is an LLM; a hallucinated category must not lose the
    // whole batch insert in Step2DocumentUpload.
    expect(coerceAssumptionCategory('regulatory')).toBe('scope')
    expect(coerceAssumptionCategory('missing')).toBe('scope')
    expect(coerceAssumptionCategory('general')).toBe('scope')
    expect(coerceAssumptionCategory(null)).toBe('scope')
    expect(coerceAssumptionCategory(undefined)).toBe('scope')
    expect(coerceAssumptionCategory(42)).toBe('scope')
  })
})

describe('wizardReducer — ADD_ASSUMPTION', () => {
  it('creates a user-provided assumption defaulting to scope', () => {
    const next = wizardReducer(makeState(), { type: 'ADD_ASSUMPTION' })
    expect(next.assumptions).toHaveLength(1)
    expect(next.assumptions[0].category).toBe('scope')
    expect(next.assumptions[0].source).toBe('user-provided')
    expect(next.assumptions[0].value).toBe('')
  })
})

describe('wizardReducer — UPDATE_ASSUMPTION category', () => {
  it('changes an assumption category without touching its other fields', () => {
    const state = makeState({ assumptions: [makeAssumption()] })
    const next = wizardReducer(state, {
      type: 'UPDATE_ASSUMPTION',
      id: 'a1',
      updates: { category: 'timeline' },
    })
    expect(next.assumptions[0].category).toBe('timeline')
    expect(next.assumptions[0].value).toBe('Test assumption')
    expect(next.assumptions[0].status).toBe('pending')
  })

  it('changes the category of a card that was added by the user', () => {
    const added = wizardReducer(makeState(), { type: 'ADD_ASSUMPTION' })
    const id = added.assumptions[0].id
    const next = wizardReducer(added, {
      type: 'UPDATE_ASSUMPTION',
      id,
      updates: { category: 'budget' },
    })
    expect(next.assumptions[0].category).toBe('budget')
  })

  it('leaves other assumptions untouched', () => {
    const state = makeState({
      assumptions: [makeAssumption({ id: 'a1' }), makeAssumption({ id: 'a2' })],
    })
    const next = wizardReducer(state, {
      type: 'UPDATE_ASSUMPTION',
      id: 'a2',
      updates: { category: 'criteria' },
    })
    expect(next.assumptions[0].category).toBe('scope')
    expect(next.assumptions[1].category).toBe('criteria')
  })
})

describe('wizardReducer — FILL_MISSING', () => {
  it('keeps the field name in the content instead of storing a bare value', () => {
    // Regression: production held rows whose entire content was "2500" / "5%",
    // reaching the model as "- [scope] 2500" with no clue what 2500 measured.
    const state = makeState({
      missingFields: [{ field: 'target_enrollment', description: 'Number of subjects' }],
    })
    const next = wizardReducer(state, {
      type: 'FILL_MISSING',
      field: 'target_enrollment',
      value: '2500',
    })
    expect(next.assumptions).toHaveLength(1)
    expect(next.assumptions[0].value).toBe('Target Enrollment: 2500')
  })

  it('still records the filled value against the missing field', () => {
    const state = makeState({
      missingFields: [{ field: 'target_enrollment', description: 'Number of subjects' }],
    })
    const next = wizardReducer(state, {
      type: 'FILL_MISSING',
      field: 'target_enrollment',
      value: '2500',
    })
    expect(next.missingFields[0].filledValue).toBe('2500')
  })

  it('marks the filled assumption approved and user-provided', () => {
    const state = makeState({
      missingFields: [{ field: 'primary_endpoint', description: 'The primary endpoint' }],
    })
    const next = wizardReducer(state, {
      type: 'FILL_MISSING',
      field: 'primary_endpoint',
      value: 'OS at 12 months',
    })
    expect(next.assumptions[0].status).toBe('approved')
    expect(next.assumptions[0].source).toBe('user-provided')
  })
})

describe('humanizeFieldName', () => {
  it('turns a snake_case field name into a prompt-readable label', () => {
    expect(humanizeFieldName('target_enrollment')).toBe('Target Enrollment')
    expect(humanizeFieldName('primary_endpoint')).toBe('Primary Endpoint')
    expect(humanizeFieldName('sponsor')).toBe('Sponsor')
  })
})
