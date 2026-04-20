---
phase: 10-template-management
plan: "03"
subsystem: wizard-ui, generation-pipeline
tags: [template-selection, wizard, step4, prompt-injection, rag]
dependency_graph:
  requires: ["10-01"]
  provides: ["template-selection-ui", "template-context-injection"]
  affects: ["src/components/wizard/Step4Generate.tsx", "supabase/functions/generate-proposal-section/index.ts", "src/hooks/useProposalGeneration.ts"]
tech_stack:
  added: []
  patterns: ["radio-card-selection", "context-block-injection", "optional-template-context"]
key_files:
  created: []
  modified:
    - src/types/wizard.ts
    - src/components/wizard/Step4Generate.tsx
    - src/components/ProposalCreationWizard.tsx
    - supabase/functions/generate-proposal-section/index.ts
    - src/hooks/useProposalGeneration.ts
    - src/types/generation.ts
    - src/pages/ProposalDetail.tsx
    - src/components/__tests__/ProposalCreationWizard.test.tsx
decisions:
  - "selectedTemplateId stored in WizardState; wizard navigates with ?generate=true; ProposalDetail reads selected_template_id from proposal record to avoid needing to pass through navigation state"
  - "stateVersion bumped 6→7 to invalidate stale sessionStorage sessions"
  - "templateContext injection placed AFTER [REGULATORY CONTEXT] block per RESEARCH.md guidance"
  - "When no template selected, templateContext is undefined — no injection, no side effects (D-16)"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-20"
  tasks_completed: 2
  files_changed: 8
---

# Phase 10 Plan 03: Template Selection UI and Generation Prompt Injection Summary

**One-liner:** Radio-card TemplateSelector in Step 4 with selectedTemplateId in WizardState (stateVersion 7), and [TEMPLATE CONTEXT] block injection into generation prompts via template_sections fetch.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend WizardState + TemplateSelector in Step4 | 473b9e4 | wizard.ts, Step4Generate.tsx, ProposalCreationWizard.tsx |
| 2 | Inject templateContext into generation prompt | 6407157 | index.ts, useProposalGeneration.ts, generation.ts, ProposalDetail.tsx, ProposalCreationWizard.test.tsx |

## What Was Built

### Task 1: WizardState + TemplateSelector
- `selectedTemplateId: string | null` added to `WizardState`
- `stateVersion` bumped to `7` (both interface and `DEFAULT_WIZARD_STATE`)
- `SET_TEMPLATE` action added to `WizardAction` union
- `case 'SET_TEMPLATE'` added to `wizardReducer` in `ProposalCreationWizard.tsx`
- `getInitialState` stateVersion guard updated from `6` to `7`
- `TemplateSelector` component in `Step4Generate.tsx`: radio cards with source badges ("Pre-built" / "Your template"), separator between prebuilt and uploaded groups, click-to-deselect behavior, accessibility `role="radiogroup"` / `role="radio"`
- `ContextSummary` updated to show selected template name or "No template — using standard structure"
- Templates fetched from Supabase filtered to `parse_status = 'ready'`

### Task 2: Generation Prompt Injection
- `buildSectionPrompt` in edge function extended with optional `templateContext` param
- `[TEMPLATE CONTEXT]...[/TEMPLATE CONTEXT]` block injected after `[REGULATORY CONTEXT]` when template sections present
- `templateContext` extracted from request body in `serve` handler
- `GenerateSectionPayload` type extended with optional `templateContext`
- `streamSection` accepts optional `templateContext` and includes it in fetch payload
- `generateAll` accepts `selectedTemplateId?`, fetches `template_sections`, saves `selected_template_id` to `proposals` table for audit
- `ProposalDetail.tsx` reads `selected_template_id` from proposal record and passes to `generateAll` (both auto-trigger and manual generate flows)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ProposalCreationWizard tests used stateVersion: 6**
- **Found during:** Task 1 verification (test run)
- **Issue:** 5 tests pre-loaded sessionStorage with `stateVersion: 6`, which now fails the updated guard
- **Fix:** Updated all 3 affected test fixtures to `stateVersion: 7` and added `selectedTemplateId: null`
- **Files modified:** `src/components/__tests__/ProposalCreationWizard.test.tsx`
- **Commit:** 6407157

**2. [Rule 1 - Bug] Supabase mock chain didn't support chained .order().order() calls**
- **Found during:** Task 1 test run — TemplateSelector calls `.order()` twice
- **Fix:** Updated mock to use a Proxy-based thenable chain so both `.order()` calls work and the chain resolves to `{ data: [], error: null }`
- **Files modified:** `src/components/__tests__/ProposalCreationWizard.test.tsx`
- **Commit:** 6407157

**3. [Scope deviation] ProposalDetail.tsx not in original file list**
- **Found during:** Task 2 — generateAll is called from ProposalDetail, not ProposalCreationWizard
- **Fix:** Added `selectedTemplateId` threading in both auto-trigger and manual generate call sites in ProposalDetail.tsx
- **Files modified:** `src/pages/ProposalDetail.tsx`
- **Commit:** 6407157

## Pre-existing Test Failures (Out of Scope)

3 tests were already failing before this plan and are unrelated to changes here:
- `SectionStreamCard.test.tsx` — ECONNREFUSED (dev server not running in CI)
- `SectionEditorBlock.test.tsx` (2 tests) — `useAuth must be used within AuthProvider` (pre-existing mock gap)

These are logged to deferred-items and not caused by this plan's changes.

## Known Stubs

None. Template cards fetch live data from Supabase filtered to `parse_status = 'ready'`. ContextSummary shows real template name. Generation prompt injection uses real template_sections rows.

## Threat Flags

None beyond the plan's threat model. RLS on `template_sections` (T-10-11) was already mitigated by Plan 01 schema.

## Self-Check: PASSED

All modified files exist on disk. Both task commits (473b9e4, 6407157) verified in git log.
