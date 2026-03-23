---
phase: 05-proposal-creation-wizard
plan: "04"
subsystem: wizard
tags: [wizard, proposal-creation, modal, supabase, react-router]
dependency_graph:
  requires:
    - 05-03 (Step1StudyInfo, WizardStepIndicator, ProposalCreationWizard shell)
    - 03-01 (FileUpload component)
    - 01-04 (ProposalsContext.createProposal)
  provides:
    - Step2DocumentUpload component
    - Step3Generate component with ContextSummary
    - ProposalCreationWizard fully wired (handleGenerate, navigation)
    - ProposalEditorModal create/edit branch routing
  affects:
    - src/components/ProposalEditorModal.tsx
    - src/components/ProposalCreationWizard.tsx
tech_stack:
  added: []
  patterns:
    - Wizard reducer dispatch pattern with sessionStorage persistence
    - Modal branching on modalProposal === undefined
    - Fire-and-forget createProposal + navigate pattern
key_files:
  created:
    - src/components/wizard/Step2DocumentUpload.tsx
    - src/components/wizard/Step3Generate.tsx
  modified:
    - src/components/ProposalCreationWizard.tsx
    - src/components/ProposalEditorModal.tsx
    - src/components/__tests__/ProposalCreationWizard.test.tsx
decisions:
  - Step 2 is informational in Phase 5 — FileUpload requires a proposalId; since proposal is created in Step 3, documents are uploaded post-creation from ProposalDetail. Step 2 shows a clear note rather than a broken upload UI.
  - modalProposal === undefined (not null) gates wizard vs edit form per research pitfall #2.
  - services and regions serialized into description as JSON.stringify({services, regions}) — no dedicated DB columns in Phase 5.
metrics:
  duration: 25m
  completed_date: "2026-03-23"
  tasks_completed: 2
  files_changed: 5
---

# Phase 05 Plan 04: Wizard Steps 2/3 + Modal Wiring Summary

End-to-end 3-step proposal creation wizard with Supabase createProposal, sessionStorage persistence, and ProposalEditorModal create/edit branching.

## What Was Built

**Step2DocumentUpload** (`src/components/wizard/Step2DocumentUpload.tsx`) — Informational upload step explaining that documents are associated post-creation, with Back/Next navigation. Phase 5 decision: FileUpload requires a proposalId that doesn't exist until Step 3 generates it, so Step 2 is a clear bridging UI.

**Step3Generate** (`src/components/wizard/Step3Generate.tsx`) — Passive ContextSummary indicator showing study info status, document count (0 in Phase 5), and output quality signal (full/reduced/limited). Generate button with spinner + "Creating..." loading state, disabled while submitting.

**ProposalCreationWizard** (updated) — Added `handleGenerate` with `useProposals().createProposal`, `useNavigate`, and `useProposalModal().closeModal`. On success: clears sessionStorage, closes modal, navigates to `/proposals/:id`. Step 1/2/3 all fully rendered.

**ProposalEditorModal** (updated) — Added create-flow branch: when `modalProposal === undefined`, renders wizard in the modal shell instead of the edit form. Edit flow is completely unchanged.

**Tests** — REQ-9.4 stub converted to passing test. 55/55 tests green (0 skipped).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/components/wizard/Step2DocumentUpload.tsx
- FOUND: src/components/wizard/Step3Generate.tsx
- FOUND: commit bf47f2d
