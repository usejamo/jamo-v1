---
phase: 06-ai-assumption-extraction
plan: "04"
subsystem: wizard-ui
tags: [assumption-extraction, wizard, edge-function, tdd]
dependency_graph:
  requires: [06-01, 06-02, 06-03]
  provides: [extraction-trigger, assumption-review-ui, assumption-db-persist]
  affects: [ProposalCreationWizard, Step2DocumentUpload, Step3AssumptionReview, proposal_assumptions]
tech_stack:
  added: []
  patterns:
    - useRef guard for fire-once extraction trigger
    - prevStep ref for step-transition side effects
    - Deno exported helper functions for unit testing without live API
key_files:
  created: []
  modified:
    - src/components/wizard/Step2DocumentUpload.tsx
    - src/components/ProposalCreationWizard.tsx
    - src/components/wizard/Step3AssumptionReview.tsx
    - src/components/__tests__/ProposalCreationWizard.test.tsx
    - supabase/functions/extract-assumptions/test.ts
decisions:
  - "Step2DocumentUpload owns document polling state — WizardState has no documents field; component fetches/polls Supabase directly by proposalId"
  - "prevStepRef tracks previous step for assumption upsert trigger — avoids re-running on unrelated state changes"
  - "mapConfidence and parseClaudeResponse exported from index.ts to enable unit testing without live Supabase/Anthropic connections"
  - "Deno live-API tests kept as ignore:true with comments — real integration tests run manually"
metrics:
  duration: ~25 minutes
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_modified: 5
---

# Phase 6 Plan 4: Extraction Trigger Wiring + Assumption Review + Test Conversion Summary

Full wizard flow connected — extraction triggers from document upload completion, Step 3 renders assumption review UI, approved assumptions persist to DB.

## Tasks Completed

### Task 1: Wire extraction trigger in Step2DocumentUpload + replace step 2 placeholder

**Step2DocumentUpload.tsx** rewritten with:
- Internal document polling via `useEffect` + `supabase.from('proposal_documents').select`
- `extractionFiredRef = useRef(false)` guard — prevents double-fire across poll intervals
- Guard: `state.assumptions.length > 0` prevents re-fire on Step 2 revisit
- Guard: `state.proposalId` must be non-null before firing
- Fire-and-forget `supabase.functions.invoke('extract-assumptions', ...)` with full response mapping
- Float confidence → tier string mapping (`>= 0.8` → high, `>= 0.5` → medium, else low)
- `SET_EXTRACTION_STATUS` dispatched at each stage (idle → extracting → complete/error)
- When `proposalId` present: renders `FileUpload` + `DocumentList` + extraction status indicator
- When no `proposalId`: shows placeholder (fast-draft path)

**ProposalCreationWizard.tsx** updated:
- Imports `useAuth`, `supabase`, `Step3AssumptionReview`
- `prevStepRef` tracks previous step for assumption persistence side effect
- `useEffect` on `state.step`: when step transitions `2 → 3`, upserts approved assumptions to `proposal_assumptions` (maps `value → content`, adds `org_id` from profile)
- step===2 now renders `<Step3AssumptionReview state={state} dispatch={dispatch} />` — placeholder removed

**Step3AssumptionReview.tsx**: added `data-testid="step-assumption-review"` to root element.

**ProposalCreationWizard.test.tsx** updated:
- Added `vi.mock('../../lib/supabase', ...)` with inline factory (avoids hoisting issue)
- Added `vi.mock('../../context/AuthContext', ...)` for `useAuth`
- Added REQ-3.3 test: confirms step===2 renders Step3AssumptionReview (not placeholder)

Commit: `8153c17`

### Task 2: Convert remaining Wave 0 stubs (REQ-3.1, 3.2, 3.6)

**supabase/functions/extract-assumptions/test.ts** rewritten with 11 real Deno tests:

- `mapConfidence`: 6 tests covering all tiers and boundary values (0.8, 0.5)
- `parseClaudeResponse` shape test — returns `{ assumptions, missing }` arrays
- `parseClaudeResponse` category extraction — all 5 expected categories present
- Missing fields array test — returned when fields not in documents
- JSON-in-prose regex extraction — Claude wraps JSON in explanation text
- Invalid JSON graceful fallback — returns `{ assumptions: [], missing: [] }`
- DB schema mapping test — asserts `content` (not `value`) column + confidence tier string + `proposal_id`/`org_id`

2 live-API tests kept as `ignore: true` with comments directing to manual integration testing.

Commit: `e868319`

## Verification

`npm run test:run` exits 0: **71/71 tests passing**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing testid] Added data-testid="step-assumption-review" to Step3AssumptionReview root**
- **Found during:** Task 1 test run
- **Issue:** REQ-3.3 test used `getByTestId('step-assumption-review')` but Step3AssumptionReview had no such testid on its root div
- **Fix:** Added `data-testid="step-assumption-review"` to the root `<div>` in Step3AssumptionReview.tsx
- **Files modified:** `src/components/wizard/Step3AssumptionReview.tsx`
- **Commit:** `8153c17`

**2. [Rule 1 - Bug] Fixed vi.mock hoisting ReferenceError**
- **Found during:** Task 1 GREEN phase
- **Issue:** `vi.mock('../../lib/supabase', () => ({ supabase: { from: mockSupabaseFrom ... } }))` referenced top-level `const mockSupabaseFrom = vi.fn()` — Vitest hoists vi.mock above variable declarations causing ReferenceError
- **Fix:** Moved mock chain creation inline inside the factory function (no external variable references)
- **Files modified:** `src/components/__tests__/ProposalCreationWizard.test.tsx`
- **Commit:** `8153c17`

## Checkpoint: Human Verify Required

The plan's checkpoint task (Task 3) requires end-to-end manual verification in the browser. See plan for full verification steps.

## Self-Check: PASSED

All files confirmed present. Both commits verified in git log.
