---
phase: 09-jamo-ai-chat-panel
plan: "02"
subsystem: editor-chat-integration
tags: [editor-refs, gap-analysis, chat-wiring, phase-9]
dependency_graph:
  requires: [09-00]
  provides: [editorRefsRef-prop, gap-analysis-useEffect, AIChatPanel-props-wired]
  affects: [src/components/editor/SectionWorkspace.tsx, src/pages/ProposalDetail.tsx]
tech_stack:
  added: []
  patterns: [ref-forwarding, useEffect-gap-trigger, component-type-cast-bridge]
key_files:
  created: []
  modified:
    - src/components/editor/SectionWorkspace.tsx
    - src/pages/ProposalDetail.tsx
decisions:
  - "Cast AIChatPanel as React.ComponentType<any> in ProposalDetail to bridge until plan 03 updates its Props interface — avoids ts-expect-error which cannot suppress JSX element errors"
metrics:
  duration: "12 minutes"
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_modified: 2
---

# Phase 9 Plan 02: EditorRefs Surface + Gap Analysis Wiring Summary

**One-liner:** SectionWorkspace exposes editorRefsRef prop; ProposalDetail computes gaps post-generation via detectGaps and passes gapCount + editorRefs to AIChatPanel.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add editorRefsRef prop to SectionWorkspace | de17cca | SectionWorkspace.tsx |
| 2 | Wire editorRefsMap and gap analysis in ProposalDetail | fe91bae | ProposalDetail.tsx |

## What Was Built

### Task 1 — SectionWorkspace editorRefsRef prop

Added optional `editorRefsRef?: React.MutableRefObject<Map<string, SectionEditorHandle>>` to `SectionWorkspaceProps`. When the prop is provided, the inner component uses it as the canonical editor refs map; when absent, it falls back to a local ref. This enables `ProposalDetail` to hold a single ref that covers all section editors for Phase 9 injection.

### Task 2 — ProposalDetail gap analysis + AIChatPanel prop wiring

- `editorRefsMap = useRef<Map<string, SectionEditorHandle>>(new Map())` — single map for all section editor handles
- `gapCount` state initialized at 0
- Gap analysis `useEffect` triggers when `genState.isGenerating` goes false and `completedCount === totalCount > 0`, calling `detectGaps(proposalSections)` and setting `gapCount`
- `SectionWorkspace` receives `editorRefsRef={editorRefsMap}`
- `AIChatPanel` receives `proposalId`, `orgId`, `sections`, `editorRefs`, `gapCount`, `onGapsConsumed` (cast via `React.ComponentType<any>` until plan 03 updates Props)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ts-expect-error cannot suppress JSX element TypeScript errors**
- **Found during:** Task 2 verification
- **Issue:** `// @ts-expect-error` in JSX comments and block expressions does not suppress TS2322 on `<AIChatPanel ...>` JSX elements — TypeScript reports TS2578 "Unused directive" instead
- **Fix:** Cast `AIChatPanel as React.ComponentType<any>` into a local variable `AIChatPanelWired` and render that — this is the standard JSX pattern for bridging props across incremental plan boundaries
- **Files modified:** src/pages/ProposalDetail.tsx
- **Commit:** fe91bae

## Known Stubs

- `AIChatPanel` receives `gapCount`, `editorRefs`, `proposalId`, `orgId`, `sections`, `onGapsConsumed` props but does not yet consume them — its Props interface is updated in Plan 03. The component renders correctly with existing props; new props are silently ignored until plan 03.

## Verification

- TypeScript: No new errors introduced. Pre-existing errors in SectionWorkspace.tsx (line 138), FileUpload.tsx, etc. are unchanged.
- Tests: 129 passed, 17 skipped, 0 failures (no regressions).

## Self-Check: PASSED

- [x] `src/components/editor/SectionWorkspace.tsx` — modified with editorRefsRef prop
- [x] `src/pages/ProposalDetail.tsx` — modified with editorRefsMap, gapCount, useEffect, AIChatPanel wiring
- [x] Commit de17cca — Task 1
- [x] Commit fe91bae — Task 2
