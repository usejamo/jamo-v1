# Proposal Wizard: Drug Discovery + "Other" Dropdown Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Drug Discovery" option to the Study Phase dropdown and an "Other" freetext escape hatch to both the Study Phase and Therapeutic Area dropdowns in the proposal creation wizard's Step 1 (Study Info).

**Architecture:** Pure UI change confined to `src/components/wizard/Step1StudyInfo.tsx` plus one data-array edit in `cro-proposal-generator.js`. Each field's "Other" state is a local `useState<boolean>` derived from whether the current `studyInfo` value is a known preset — no `WizardState`/reducer/type/DB changes. When "Other" is chosen, the field's dispatched value becomes whatever the user types, not the literal string `"Other"`, so it flows unchanged into `promptAssembly.ts`'s generation prompt and the `proposals` table exactly like a preset value would.

**Tech Stack:** React (function components + hooks), TypeScript, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-10-proposal-wizard-dropdown-options-design.md`

## Global Constraints

- Both Study Phase and Therapeutic Area remain **required** fields — satisfied by either a preset option or typed custom text. No change to `validateStep1`.
- No changes to `WizardState`, `WizardAction`, `StudyInfo`, `stateVersion`, the reducer, or any database column/migration.
- The value dispatched to `studyInfo.studyPhase` / `studyInfo.therapeuticArea` when "Other" is used is the **typed text itself** — never the literal string `"Other"`.
- No normalization or deduplication of custom text, and no character limit beyond what existing text inputs in this form already allow.
- "Drug Discovery" is inserted **before** `Phase I (First-in-Human)` in `STUDY_PHASES` (first element).
- "Other" is the **last** `<option>` in both dropdowns.

---

### Task 1: Add "Drug Discovery" to the Study Phase list

**Files:**
- Modify: `cro-proposal-generator.js:538-549` (`STUDY_PHASES` array)
- Test: `src/components/__tests__/Step1StudyInfo.test.tsx` (new file)

**Interfaces:**
- Consumes: `STUDY_PHASES` (exported `string[]` from `cro-proposal-generator.js`), `Step1StudyInfo` component (`{ state: WizardState; dispatch: React.Dispatch<WizardAction> }`), `WizardState`/`StudyInfo` types from `src/types/wizard.ts`.
- Produces: A `makeState(overrides?: Partial<StudyInfo>): WizardState` test helper in the new test file — later tasks in this plan reuse it verbatim.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/Step1StudyInfo.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/Step1StudyInfo.test.tsx`
Expected: FAIL — `labels[1]` is currently `'Phase I (First-in-Human)'`, not `'Drug Discovery'`.

- [ ] **Step 3: Add "Drug Discovery" to the data array**

In `cro-proposal-generator.js`, change:

```js
export const STUDY_PHASES = [
  'Phase I (First-in-Human)',
```

to:

```js
export const STUDY_PHASES = [
  'Drug Discovery',
  'Phase I (First-in-Human)',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/Step1StudyInfo.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cro-proposal-generator.js src/components/__tests__/Step1StudyInfo.test.tsx
git commit -m "feat(wizard): add Drug Discovery to Study Phase options

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: "Other" freetext for Study Phase

**Files:**
- Modify: `src/components/wizard/Step1StudyInfo.tsx:1` (imports), `:146-166` (Study Phase block)
- Test: `src/components/__tests__/Step1StudyInfo.test.tsx` (append)

**Interfaces:**
- Consumes: `makeState` helper from Task 1; `handleTextChange(field: keyof StudyInfo, value: string)` (existing local function in `Step1StudyInfo.tsx`, unchanged signature).
- Produces: A local `useState<boolean>` pattern (`studyPhaseOther` / `setStudyPhaseOther`) that Task 3 mirrors for `therapeuticArea`. An `aria-label="Custom Study Phase"` text input, used by this task's tests and referenced in the plan's self-review — no other task depends on its exact label text beyond this one.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/__tests__/Step1StudyInfo.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/Step1StudyInfo.test.tsx`
Expected: The 4 new tests FAIL (no "Other" option exists yet, `getByLabelText('Custom Study Phase')` throws).

- [ ] **Step 3: Implement**

In `src/components/wizard/Step1StudyInfo.tsx`, add the import:

```tsx
import { useState } from 'react'
```

Inside the `Step1StudyInfo` function body, after `const { studyInfo, errors } = state`, add:

```tsx
  const [studyPhaseOther, setStudyPhaseOther] = useState(
    () => studyInfo.studyPhase !== '' && !STUDY_PHASES.includes(studyInfo.studyPhase)
  )

  function handleStudyPhaseChange(value: string) {
    if (value === 'Other') {
      setStudyPhaseOther(true)
      handleTextChange('studyPhase', '')
    } else {
      setStudyPhaseOther(false)
      handleTextChange('studyPhase', value)
    }
  }
```

Replace the Study Phase block:

```tsx
      {/* Study Phase */}
      <div>
        <label htmlFor="studyPhase" className="block text-sm font-medium text-gray-700 mb-1">
          Study Phase
        </label>
        <select
          id="studyPhase"
          value={studyPhaseOther ? 'Other' : studyInfo.studyPhase}
          onChange={(e) => handleStudyPhaseChange(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Study Phase"
        >
          <option value="">Select study phase…</option>
          {STUDY_PHASES.map((ph) => (
            <option key={ph} value={ph}>{ph}</option>
          ))}
          <option value="Other">Other</option>
        </select>
        {studyPhaseOther && (
          <input
            type="text"
            value={studyInfo.studyPhase}
            onChange={(e) => handleTextChange('studyPhase', e.target.value)}
            placeholder="Enter study phase"
            className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
            aria-label="Custom Study Phase"
          />
        )}
        {errors.studyPhase && (
          <p className="mt-1 text-xs text-red-600">{errors.studyPhase}</p>
        )}
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/Step1StudyInfo.test.tsx`
Expected: PASS (all tests, including Task 1's)

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/Step1StudyInfo.tsx src/components/__tests__/Step1StudyInfo.test.tsx
git commit -m "feat(wizard): add Other freetext option to Study Phase dropdown

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: "Other" freetext for Therapeutic Area

**Files:**
- Modify: `src/components/wizard/Step1StudyInfo.tsx:77-97` (Therapeutic Area block)
- Test: `src/components/__tests__/Step1StudyInfo.test.tsx` (append)

**Interfaces:**
- Consumes: `makeState` helper from Task 1; `handleTextChange` (unchanged); same `useState`-derived-from-membership pattern established in Task 2, applied to `therapeuticArea` / `THERAPEUTIC_AREAS`.
- Produces: An `aria-label="Custom Therapeutic Area"` text input, used by this task's tests and by Task 4.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/__tests__/Step1StudyInfo.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/Step1StudyInfo.test.tsx`
Expected: The 4 new tests FAIL.

- [ ] **Step 3: Implement**

Add alongside `studyPhaseOther` in `Step1StudyInfo.tsx`:

```tsx
  const [therapeuticAreaOther, setTherapeuticAreaOther] = useState(
    () => studyInfo.therapeuticArea !== '' && !THERAPEUTIC_AREAS.includes(studyInfo.therapeuticArea)
  )

  function handleTherapeuticAreaChange(value: string) {
    if (value === 'Other') {
      setTherapeuticAreaOther(true)
      handleTextChange('therapeuticArea', '')
    } else {
      setTherapeuticAreaOther(false)
      handleTextChange('therapeuticArea', value)
    }
  }
```

Replace the Therapeutic Area block:

```tsx
      {/* Therapeutic Area */}
      <div>
        <label htmlFor="therapeuticArea" className="block text-sm font-medium text-gray-700 mb-1">
          Therapeutic Area
        </label>
        <select
          id="therapeuticArea"
          value={therapeuticAreaOther ? 'Other' : studyInfo.therapeuticArea}
          onChange={(e) => handleTherapeuticAreaChange(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Therapeutic Area"
        >
          <option value="">Select therapeutic area…</option>
          {THERAPEUTIC_AREAS.map((ta) => (
            <option key={ta} value={ta}>{ta}</option>
          ))}
          <option value="Other">Other</option>
        </select>
        {therapeuticAreaOther && (
          <input
            type="text"
            value={studyInfo.therapeuticArea}
            onChange={(e) => handleTextChange('therapeuticArea', e.target.value)}
            placeholder="Enter therapeutic area"
            className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
            aria-label="Custom Therapeutic Area"
          />
        )}
        {errors.therapeuticArea && (
          <p className="mt-1 text-xs text-red-600">{errors.therapeuticArea}</p>
        )}
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/__tests__/Step1StudyInfo.test.tsx`
Expected: PASS (all 9 tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/Step1StudyInfo.tsx src/components/__tests__/Step1StudyInfo.test.tsx
git commit -m "feat(wizard): add Other freetext option to Therapeutic Area dropdown

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Regression test — custom text reaches the generated proposal payload

**Files:**
- Modify: `src/components/__tests__/ProposalCreationWizard.test.tsx` (append one test)

**Interfaces:**
- Consumes: Existing test-file mocks (`mockCreateProposal`, `sessionStorage` seeding pattern) already present in `ProposalCreationWizard.test.tsx` — no new mocks needed. Exercises the real `Step1StudyInfo` + `ProposalCreationWizard` + reducer wiring built in Tasks 1-3.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('ProposalCreationWizard', ...)` block in `src/components/__tests__/ProposalCreationWizard.test.tsx`, right after the `REQ-9.4` test:

```tsx
  it('flows a custom ("Other") Study Phase / Therapeutic Area straight into the generated proposal payload', () => {
    mockCreateProposal.mockResolvedValueOnce('proposal-456')
    sessionStorage.setItem('jamo-wizard-state', JSON.stringify({
      step: 3,
      proposalId: null,
      studyInfo: {
        sponsorName: 'Vertex',
        therapeuticArea: 'Rare Pediatric Metabolic Disorder',
        indication: 'MPS Type II',
        studyPhase: 'Adaptive Basket Design',
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
      stateVersion: 9,
    }))
    render(<ProposalCreationWizard />)
    fireEvent.click(screen.getByTestId('generate-button'))
    // The exact custom strings typed under "Other" — not the literal word "Other" — must
    // reach the payload that becomes the proposal record and the generation prompt.
    expect(mockCreateProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Vertex — MPS Type II (Adaptive Basket Design)',
        therapeuticArea: 'Rare Pediatric Metabolic Disorder',
        studyType: 'Adaptive Basket Design',
      })
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/ProposalCreationWizard.test.tsx`
Expected: Depends on current `Step4Generate`/`createProposal` wiring — if it fails, confirm the failure is a genuine assertion mismatch (not a setup/type error) before proceeding. Since Tasks 1-3 don't touch this payload-building code, this test should already pass once written; if so, treat step 2/3 as already satisfied and skip to Step 4 to confirm.

- [ ] **Step 3: No implementation change expected**

This task is a regression guard, not new functionality — Tasks 1-3 already make the custom text the literal `studyInfo` value, and `ProposalCreationWizard.tsx`'s existing `createProposal({ therapeuticArea: studyInfo.therapeuticArea, studyType: studyInfo.studyPhase, ... })` call (see `ProposalCreationWizard.tsx:63-73`) already forwards whatever string is in `studyInfo`. If the test fails for a reason other than "feature not built yet" (e.g. a payload field name changed), fix `ProposalCreationWizard.tsx` to match, not the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/ProposalCreationWizard.test.tsx`
Expected: PASS (all tests in the file, including pre-existing ones)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions elsewhere.

- [ ] **Step 6: Commit**

```bash
git add src/components/__tests__/ProposalCreationWizard.test.tsx
git commit -m "test(wizard): verify custom Other text reaches the generated proposal payload

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
