---
phase: 06-ai-assumption-extraction
plan: "01"
subsystem: wizard-types
tags: [types, wizard, assumptions, phase6]
dependency_graph:
  requires: [06-00]
  provides: [wizard-assumption-types, step4-generate, 4-step-wizard-shell]
  affects: [06-02, 06-03, 06-04]
tech_stack:
  added: []
  patterns: [stateVersion-guard, discriminated-union-actions, crypto-randomUUID]
key_files:
  created:
    - src/components/wizard/Step4Generate.tsx
  modified:
    - src/types/wizard.ts
    - src/components/ProposalCreationWizard.tsx
    - src/components/__tests__/ProposalCreationWizard.test.tsx
  deleted:
    - src/components/wizard/Step3Generate.tsx
decisions:
  - "stateVersion:6 guard in getInitialState() resets stale sessionStorage — clears pre-Phase-6 shapes automatically"
  - "Step4Generate Back button dispatches step:2 (Assumption Review), not step:1"
  - "FILL_MISSING appends an approved WizardAssumption with source:'user-provided' in addition to setting filledValue"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-23"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Phase 06 Plan 01: Wizard Type Contracts + 4-Step Shell Summary

**One-liner:** Extended wizard type system with full assumption types (WizardAssumption, MissingField, ExtractionStatus), added stateVersion:6 guard, renamed Step3Generate to Step4Generate, and restructured wizard shell to 4 steps.

## What Was Built

- `src/types/wizard.ts` — Added `AssumptionStatus`, `ConfidenceLevel`, `ExtractionStatus`, `WizardAssumption`, `MissingField` exports. Extended `WizardState` with `step: 0|1|2|3`, `assumptions`, `missingFields`, `extractionStatus`, `stateVersion: 6`. Added 5 new `WizardAction` union variants.
- `src/components/ProposalCreationWizard.tsx` — Updated `wizardReducer` with all new action handlers (SET_ASSUMPTIONS, UPDATE_ASSUMPTION, ADD_ASSUMPTION, FILL_MISSING, SET_EXTRACTION_STATUS). `getInitialState()` now rejects stale sessionStorage via `stateVersion !== 6` check. SKIP_TO_GENERATE dispatches `step:3`. Renders step===2 as placeholder div, step===3 as Step4Generate.
- `src/components/wizard/Step4Generate.tsx` — Renamed from Step3Generate; adds assumption count display in ContextSummary ("X assumptions approved" or "No assumptions (fast draft)"). Back button goes to step:2 (Assumption Review).
- `src/components/__tests__/ProposalCreationWizard.test.tsx` — All fixtures updated to `step:3` + `stateVersion:6`. Added test for stale sessionStorage reset. REQ-1.1 now asserts 4 steps.
- `src/components/wizard/WizardStepIndicator.tsx` — No changes needed (already renders `steps` prop dynamically; WIZARD_STEPS update in wizard.ts is sufficient).

## Verification

- `npm run test:run` exits 0: 56 passing, 14 skipped
- `WIZARD_STEPS` has 4 entries: `['Study Info', 'Document Upload', 'Assumption Review', 'Template & Generate']`
- `DEFAULT_WIZARD_STATE.stateVersion === 6`
- `SKIP_TO_GENERATE` dispatches `step:3`
- `Step4Generate.tsx` exists; `Step3Generate.tsx` deleted

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/types/wizard.ts` exists and exports all required types
- [x] `src/components/wizard/Step4Generate.tsx` exists
- [x] `src/components/wizard/Step3Generate.tsx` deleted
- [x] Commits fdeff22 and 768da1e exist
- [x] `npm run test:run` exits 0

## Self-Check: PASSED
