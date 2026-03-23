# Phase 5: Proposal Creation Wizard - Research

**Researched:** 2026-03-23
**Domain:** React multi-step wizard, useReducer state management, sessionStorage persistence, Supabase CRUD, Framer Motion modal
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 3 steps in Phase 5: (1) Study Info → (2) Document Upload → (3) Template & Generate
- Step 3 (Assumption Review) is skipped entirely in Phase 5 — no placeholder, no dead UI
- Phase 6 will insert Assumption Review as a step between Document Upload and Template & Generate
- Free backward navigation — users can click any prior step indicator to revisit it
- Forward navigation requires per-step validation (hard required fields must pass)
- Step indicator: numbered steps with labels below each number (e.g., "1 · Study Info")
- "Skip to Fast Draft" available from Step 1 onward — jumps directly to Step 3, no confirmation dialog
- Step 3 shows a passive context indicator summarizing what data is/isn't present
- Hard required fields (gate advancement): Sponsor name, Therapeutic Area, Indication, Study Phase
- Optional with completeness indicator: Countries/regions, Proposal due date, Services requested
- Services displayed as pill toggles (click to select/deselect) — filled/colored when selected, outlined when not
- AVAILABLE_SERVICES restructured from string array to objects with `label` and `category` properties
- Categories derived from constant — no separate hardcoded grouping logic
- Step 2 reuses FileUpload component from Phase 3 directly
- No template picker UI in Phase 5 — "Default Template" pre-selected silently
- Generate button creates proposal record in Supabase, then navigates to ProposalDetail page
- AI generation itself is Phase 7 — Phase 5 only creates the record
- `useReducer` for wizard state management
- `sessionStorage` persistence across step navigation and page refreshes
- Preserves existing ProposalModalContext open/close pattern and Framer Motion modal animation

### Claude's Discretion
- Passive context indicator on Step 3 design — informational, not alarming (quiet summary row, not warning banner)
- Completeness indicator on optional Step 1 fields — gentle nudge, progress signal, not an error state
- Services pill toggles implementation details — must be visually unambiguous at a glance

### Deferred Ideas (OUT OF SCOPE)
- Assumption Review step (Step 3 in final flow) — Phase 6
- Template selection UI in Step 3 — Phase 10
- AI proposal generation from wizard data — Phase 7
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-1.1 | 4-step wizard (3 steps in Phase 5): Study Info → Document Upload → Template & Generate | useReducer wizard architecture pattern below |
| REQ-1.2 | Step 1 captures: sponsor name/contact, therapeutic area, indication, study phase, countries/regions, proposal due date, services requested | Existing THERAPEUTIC_AREAS, STUDY_PHASES constants in cro-proposal-generator.js; AVAILABLE_SERVICES needs restructuring |
| REQ-1.3 | Step 2 supports multi-file upload PDF/DOCX/TXT/XLSX | FileUpload component already built in Phase 3 — direct reuse |
| REQ-1.4 | Files upload directly to Supabase Storage | Already implemented in FileUpload.tsx — no change needed |
| REQ-1.5 | "Skip to Fast Draft" button from Step 1 onward | Jump to step index 2 (Step 3) in reducer dispatch |
| REQ-1.6 | Wizard state persists in sessionStorage across step navigation | sessionStorage pattern already used in project; serialize reducer state to JSON |
| REQ-1.7 | Each step validates required fields before advancing; shows clear error states | Per-step validation map in reducer or local component state |
| REQ-9.4 | Template selection in Step 4 of wizard (Step 3 in Phase 5) | Default template pre-selected silently; no UI in Phase 5 |
</phase_requirements>

---

## Summary

Phase 5 replaces the single-form `ProposalEditorModal` with a 3-step wizard that collects richer study data before creating a Supabase proposal record. The existing modal infrastructure (ProposalModalContext, Framer Motion animation, backdrop pattern) is preserved exactly — only the content inside the modal changes.

The wizard is self-contained: a single `ProposalCreationWizard` component rendering the correct step, with all state held in a `useReducer` and mirrored to `sessionStorage`. Steps 1 and 2 are new UI; Step 2 directly mounts the existing `FileUpload` component; Step 3 is minimal (passive context indicator + Generate button). On Generate, `ProposalsContext.createProposal()` is called with the wizard payload and the user is navigated to `/proposals/:id`.

The main data transformation work is restructuring `AVAILABLE_SERVICES` from a flat string array to `{ label: string; category: string }[]` objects in `cro-proposal-generator.js`, which enables the grouped pill toggle UI.

**Primary recommendation:** Build `ProposalCreationWizard` as a drop-in replacement for the modal body. Keep ProposalEditorModal.tsx in place for edit-proposal use (it serves a different purpose — editing existing proposals, not creating new ones).

---

## Standard Stack

### Core (already installed — no new installs required)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | Component framework | Project standard |
| Framer Motion | 12.34.3 | Modal animation, step transitions | Already installed and used for modal |
| React Router | v7 | Navigation to ProposalDetail on completion | Already installed |
| Supabase JS | 2.x | Proposal record creation | Already wired via ProposalsContext |

### No new dependencies
This phase requires zero new npm installs. All capabilities come from existing project libraries.

---

## Architecture Patterns

### Recommended File Structure
```
src/
├── components/
│   ├── ProposalCreationWizard.tsx      # Top-level wizard shell (replaces modal body for create flow)
│   ├── wizard/
│   │   ├── WizardStepIndicator.tsx     # Numbered step header with labels
│   │   ├── Step1StudyInfo.tsx          # Study info form
│   │   ├── Step2DocumentUpload.tsx     # Wraps FileUpload component
│   │   └── Step3Generate.tsx          # Context indicator + Generate button
│   └── __tests__/
│       └── ProposalCreationWizard.test.tsx
```

### Pattern 1: useReducer Wizard State
**What:** Single reducer manages current step, form data, validation errors, and loading state.
**When to use:** Multi-step flows where steps share data and transitions have side effects.

```typescript
// Wizard state shape
interface WizardState {
  step: 0 | 1 | 2                        // 0=StudyInfo, 1=DocumentUpload, 2=Generate
  proposalId: string | null              // Set after proposal record created
  studyInfo: {
    sponsorName: string
    therapeuticArea: string
    indication: string
    studyPhase: string
    regions: string[]
    dueDate: string
    services: string[]                   // label values of selected services
  }
  errors: Partial<Record<keyof StudyInfo, string>>
  submitting: boolean
}

type WizardAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'SKIP_TO_GENERATE' }
  | { type: 'UPDATE_STUDY_INFO'; field: string; value: unknown }
  | { type: 'TOGGLE_SERVICE'; label: string }
  | { type: 'SET_ERRORS'; errors: Record<string, string> }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_PROPOSAL_ID'; id: string }
  | { type: 'RESET' }
```

### Pattern 2: sessionStorage Persistence
**What:** Serialize reducer state to sessionStorage on every dispatch; hydrate from sessionStorage on mount.
**When to use:** Wizard state must survive step navigation and accidental refreshes within the same browser session.

```typescript
// Hydration on mount
const stored = sessionStorage.getItem('wizard-state')
const initialState: WizardState = stored ? JSON.parse(stored) : defaultState

// Persistence in reducer (or via useEffect watching state)
useEffect(() => {
  sessionStorage.setItem('wizard-state', JSON.stringify(state))
}, [state])

// Cleanup on successful completion or cancel
sessionStorage.removeItem('wizard-state')
```

### Pattern 3: ProposalModalContext Slot-In
**What:** ProposalEditorModal.tsx currently renders the single-form create/edit UI. For Phase 5, the wizard mounts in place of the existing form when `modalProposal` is undefined (create flow). Edit flow continues to use the existing form.

```typescript
// ProposalEditorModal.tsx — add branch at top
if (!isEdit) {
  return <ProposalCreationWizard />  // New wizard for create
}
// ... existing edit form continues unchanged
```

This preserves Framer Motion animation (it wraps the entire modal div) and the backdrop/click-outside behavior — the wizard inherits both with zero animation work.

### Pattern 4: Step Validation
**What:** Each step defines a `validate()` function returning an errors map. Forward navigation calls validate; if errors is non-empty, set errors in state and block advance.

```typescript
function validateStep1(studyInfo: StudyInfo): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!studyInfo.sponsorName.trim()) errors.sponsorName = 'Required'
  if (!studyInfo.therapeuticArea) errors.therapeuticArea = 'Required'
  if (!studyInfo.indication.trim()) errors.indication = 'Required'
  if (!studyInfo.studyPhase) errors.studyPhase = 'Required'
  return errors
}
```

### Pattern 5: AVAILABLE_SERVICES Restructure
**What:** Transform flat string array to categorized objects in `cro-proposal-generator.js`.

```typescript
// New shape (replaces the flat string array)
export const AVAILABLE_SERVICES: ServiceOption[] = [
  { label: 'Project Management', category: 'Core Services' },
  { label: 'Regulatory Affairs & Study Start-Up', category: 'Core Services' },
  { label: 'Site Selection, Feasibility & Activation', category: 'Core Services' },
  { label: 'Clinical Monitoring (On-site)', category: 'Monitoring' },
  { label: 'Clinical Monitoring (Remote/Centralized)', category: 'Monitoring' },
  { label: 'Patient Recruitment & Retention', category: 'Enrollment' },
  { label: 'Data Management & EDC', category: 'Data & Statistics' },
  { label: 'Biostatistics & Statistical Programming', category: 'Data & Statistics' },
  { label: 'Medical Writing (CSR)', category: 'Medical Writing' },
  { label: 'Medical Writing (Protocol/ICF)', category: 'Medical Writing' },
  { label: 'Medical Writing (Regulatory Submissions)', category: 'Medical Writing' },
  { label: 'Safety & Pharmacovigilance', category: 'Safety' },
  { label: 'Quality Assurance', category: 'Quality' },
  { label: 'Clinical Supply / IP Management', category: 'Specialty' },
  { label: 'Central Laboratory Services', category: 'Specialty' },
  { label: 'Specialty Laboratory Services', category: 'Specialty' },
  { label: 'Third-Party Vendor Management', category: 'Specialty' },
  { label: 'DSMB/DMC Support', category: 'Specialty' },
  { label: 'eConsent', category: 'Technology' },
  { label: 'ePRO/eCOA', category: 'Technology' },
]

// Derive groups — no separate hardcoded logic
const groupedServices = AVAILABLE_SERVICES.reduce((acc, s) => {
  if (!acc[s.category]) acc[s.category] = []
  acc[s.category].push(s)
  return acc
}, {} as Record<string, ServiceOption[]>)
```

### Pattern 6: ProposalCreationWizard → ProposalsContext Integration
**What:** Step 3 Generate button calls `createProposal()` with the wizard payload, then navigates.

```typescript
// createProposal already returns Promise<string> (the new proposal id)
async function handleGenerate() {
  dispatch({ type: 'SET_SUBMITTING', value: true })
  try {
    const id = await createProposal({
      title: `${studyInfo.sponsorName} — ${studyInfo.indication}`,
      client: studyInfo.sponsorName,
      therapeuticArea: studyInfo.therapeuticArea,
      studyType: studyInfo.studyPhase,
      indication: studyInfo.indication,
      dueDate: studyInfo.dueDate,
      status: 'draft',
      value: 0,
      // services stored as JSON or comma-separated in description for now
      // Phase 7 will wire these to generation input
    })
    sessionStorage.removeItem('wizard-state')
    closeModal()
    navigate(`/proposals/${id}`)
  } finally {
    dispatch({ type: 'SET_SUBMITTING', value: false })
  }
}
```

### Anti-Patterns to Avoid
- **Replacing ProposalEditorModal entirely:** The existing modal also handles edit-proposal flow — replace only the create branch, not the whole component.
- **Storing File objects in sessionStorage:** File objects are not serializable. sessionStorage should store only the wizard metadata (study info, step index). Document upload state is ephemeral — if user refreshes during Step 2, they re-upload (acceptable).
- **Framer Motion on individual steps:** Don't add step-transition animations. The existing modal open/close animation is sufficient; step changes can be instant or simple CSS opacity.
- **New modal wrapper:** The wizard renders inside the existing modal shell — don't create a second backdrop/z-50 wrapper.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File upload | Custom upload logic | `FileUpload` component (Phase 3) | Already handles Storage paths, parse_status insert, error states, 50MB limit |
| Modal animation | Custom CSS transitions | Framer Motion (already on modal div) | Inherited for free from parent modal |
| Supabase insert | Raw fetch | `ProposalsContext.createProposal()` | Already handles org_id scoping, optimistic state update, error handling |
| Navigation | window.location | React Router `useNavigate` | Avoids full-page reload, preserves SPA state |

---

## Common Pitfalls

### Pitfall 1: File Objects in sessionStorage
**What goes wrong:** Attempting to serialize File objects (from Step 2 upload) into sessionStorage throws or stores `{}`.
**Why it happens:** File is a browser API object — not JSON-serializable.
**How to avoid:** Only persist scalar wizard fields (step index, studyInfo fields, selected services). Document upload state is intentionally ephemeral.
**Warning signs:** `JSON.stringify` returns `{}` for File; no error thrown, data silently lost.

### Pitfall 2: ProposalModalContext openModal(proposal) for Edit vs Create
**What goes wrong:** Wizard mounts when editing existing proposals if the branch condition is wrong.
**Why it happens:** `openModal()` with no argument = create; `openModal(proposal)` = edit. If condition checks `modalProposal === null` instead of `=== undefined`, new proposals passed as `null` break.
**How to avoid:** Use `modalProposal === undefined` (not `=== null`) for the create branch.

### Pitfall 3: proposals table missing wizard-specific columns
**What goes wrong:** `createProposal()` called with new fields (services, regions) that don't exist in the proposals table schema.
**Why it happens:** The current `createProposal` only maps the fields from the original modal form.
**How to avoid:** For Phase 5, map `services` and `regions` into existing columns (e.g., `description`) or defer to Phase 7. Do NOT add new DB columns in this phase — that's infrastructure scope creep.

### Pitfall 4: Step indicator click navigation bypassing validation
**What goes wrong:** Clicking step 1 from step 2 is fine (backward), but clicking step 3 from step 1 must be blocked unless all required fields are filled — same as "Next" button.
**Why it happens:** Step indicator `onClick` handlers may naively just dispatch `SET_STEP`.
**How to avoid:** Step indicator clicks forward = validate first; clicks backward = always allow.

### Pitfall 5: sessionStorage key collision
**What goes wrong:** Multiple open wizard instances or leftover state from aborted sessions causes stale data to appear in new wizard open.
**Why it happens:** sessionStorage persists until tab closes.
**How to avoid:** Clear sessionStorage key on `closeModal()` (cancel) and on successful `createProposal()`. Also reset state in wizard's `useEffect` triggered by `isOpen` becoming true.

---

## Code Examples

### Step Indicator Component
```typescript
// Numbered step header — clicking prior steps allows backward nav
function WizardStepIndicator({
  steps, currentStep, onStepClick
}: {
  steps: string[]
  currentStep: number
  onStepClick: (index: number) => void
}) {
  return (
    <div className="flex items-center gap-0 px-6 pt-5 pb-4 border-b border-gray-100">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-0">
          <button
            onClick={() => i < currentStep && onStepClick(i)}
            disabled={i > currentStep}
            className={[
              'flex flex-col items-center gap-1 px-3',
              i < currentStep ? 'cursor-pointer' : 'cursor-default',
            ].join(' ')}
          >
            <span className={[
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
              i === currentStep ? 'bg-jamo-500 text-white' :
              i < currentStep ? 'bg-jamo-100 text-jamo-600' :
              'bg-gray-100 text-gray-400'
            ].join(' ')}>
              {i + 1}
            </span>
            <span className="text-xs text-gray-500">{label}</span>
          </button>
          {i < steps.length - 1 && (
            <div className={['h-px w-8 mt-[-1rem]', i < currentStep ? 'bg-jamo-200' : 'bg-gray-200'].join(' ')} />
          )}
        </div>
      ))}
    </div>
  )
}
```

### Passive Context Indicator (Step 3 when arriving via Skip)
```typescript
// Quiet summary row — informational, not a warning banner
function ContextSummary({ studyInfo, documentCount }: {
  studyInfo: WizardState['studyInfo']
  documentCount: number
}) {
  const hasStudyInfo = studyInfo.sponsorName && studyInfo.therapeuticArea
  return (
    <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 flex gap-3">
      <span>{hasStudyInfo ? 'Study info \u2713' : 'Study info: none'}</span>
      <span className="text-gray-300">·</span>
      <span>{documentCount > 0 ? `${documentCount} document${documentCount > 1 ? 's' : ''} \u2713` : 'Documents: none'}</span>
      <span className="text-gray-300">·</span>
      <span className={documentCount === 0 && !hasStudyInfo ? 'text-amber-500' : 'text-gray-400'}>
        Output quality: {documentCount > 0 && hasStudyInfo ? 'full' : documentCount > 0 || hasStudyInfo ? 'reduced' : 'limited'}
      </span>
    </div>
  )
}
```

### Services Pill Toggles
```typescript
// Grouped pill toggles — filled when selected, outlined when not
function ServicesPicker({ selected, onChange }: {
  selected: string[]
  onChange: (services: string[]) => void
}) {
  const groups = groupServicesByCategory(AVAILABLE_SERVICES)
  function toggle(label: string) {
    onChange(
      selected.includes(label)
        ? selected.filter(s => s !== label)
        : [...selected, label]
    )
  }
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([category, services]) => (
        <div key={category}>
          <p className="text-xs font-medium text-gray-400 mb-1.5">{category}</p>
          <div className="flex flex-wrap gap-1.5">
            {services.map(s => {
              const isSelected = selected.includes(s.label)
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => toggle(s.label)}
                  className={[
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    isSelected
                      ? 'bg-jamo-500 border-jamo-500 text-white'
                      : 'border-gray-300 text-gray-600 hover:border-jamo-300'
                  ].join(' ')}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ProposalEditorModal` single form | Multi-step wizard with reducer | Phase 5 | Richer data capture; same modal shell preserved |
| `AVAILABLE_SERVICES` flat string[] | `{ label, category }[]` objects | Phase 5 | Enables grouped pill UI without separate grouping logic |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-1.1 | Wizard renders 3-step indicator with correct labels | unit | `npm run test:run -- ProposalCreationWizard` | ❌ Wave 0 |
| REQ-1.2 | Step 1 form fields render; hard-required fields block advance when empty | unit | `npm run test:run -- ProposalCreationWizard` | ❌ Wave 0 |
| REQ-1.5 | "Skip to Fast Draft" button jumps to Step 3 from Step 1 | unit | `npm run test:run -- ProposalCreationWizard` | ❌ Wave 0 |
| REQ-1.6 | Wizard state serialized to sessionStorage on change, hydrated on remount | unit | `npm run test:run -- ProposalCreationWizard` | ❌ Wave 0 |
| REQ-1.7 | Forward navigation blocked with error display when required fields empty | unit | `npm run test:run -- ProposalCreationWizard` | ❌ Wave 0 |
| REQ-9.4 | Step 3 renders "Default Template" silently; Generate button calls createProposal | unit | `npm run test:run -- ProposalCreationWizard` | ❌ Wave 0 |
| REQ-1.3/4 | Step 2 mounts FileUpload; documents upload to Supabase Storage | manual smoke | N/A — FileUpload already tested in Phase 3 | ✅ existing |

### Sampling Rate
- **Per task commit:** `npm run test:run`
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/ProposalCreationWizard.test.tsx` — covers REQ-1.1, 1.2, 1.5, 1.6, 1.7, 9.4

---

## Open Questions

1. **Where do `services` and `regions` get stored in the proposals table?**
   - What we know: Current `createProposal()` maps to: title, client_name, study_type, therapeutic_area, indication, description, due_date, estimated_value, status.
   - What's unclear: `services` (array of strings) and `regions` (array of strings) have no dedicated DB columns in the current schema.
   - Recommendation: For Phase 5, serialize services as JSON string into `description` or add a `services` text[] column in a lightweight migration. Cleanest option: add `services text[] DEFAULT '{}'` and `regions text[] DEFAULT '{}'` to proposals table — these are used by Phase 7 generation.

2. **Does `ProposalEditorModal` need to remain for the edit flow?**
   - What we know: The existing modal is used for both creating and editing proposals. Phase 5 replaces only the create branch.
   - Recommendation: Keep ProposalEditorModal.tsx, add a `!isEdit` branch at the top that renders `<ProposalCreationWizard />`. Do not delete the existing form.

3. **What proposal `title` is auto-generated on wizard completion?**
   - What we know: The existing modal has an explicit "Project Name" field. The wizard's Step 1 collects sponsor, TA, indication — not a freeform title.
   - Recommendation: Auto-generate title as `${sponsorName} — ${indication} (${studyPhase})` on creation. User can rename via the edit modal afterward.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/components/ProposalEditorModal.tsx` — existing modal structure and Framer Motion pattern
- Direct code inspection: `src/context/ProposalModalContext.tsx` — open/close pattern, isOpen/modalProposal state
- Direct code inspection: `src/context/ProposalsContext.tsx` — createProposal signature, DB column mapping
- Direct code inspection: `cro-proposal-generator.js` lines 484–544 — AVAILABLE_SERVICES, THERAPEUTIC_AREAS, STUDY_PHASES constants
- Direct code inspection: `.planning/phases/05-proposal-creation-wizard/05-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — vitest 4.0.4, forks+singleFork+happy-dom pool config, existing test patterns
- `.planning/REQUIREMENTS.md` — REQ-1.x full descriptions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed and in use
- Architecture: HIGH — patterns derived directly from existing codebase code inspection
- Pitfalls: HIGH — derived from direct schema/code analysis, not speculation
- Validation: HIGH — existing test infrastructure confirmed in `src/components/__tests__/`

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain — React/Supabase patterns don't change fast)
