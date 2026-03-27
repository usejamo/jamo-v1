---
phase: 08-section-workspace-rich-text-editor
plan: 02
subsystem: editor
tags: [ai-actions, sse-streaming, tiptap, preview-ux, version-history]
dependency_graph:
  requires: ["08-01"]
  provides: ["per-section AI action toolbar", "inline preview UX", "before/after diff view"]
  affects: ["SectionEditorBlock", "SectionWorkspaceContext"]
tech_stack:
  added: []
  patterns: ["SSE raw fetch streaming", "pre-action snapshot versioning", "framer-motion AnimatePresence"]
key_files:
  created:
    - src/hooks/useSectionAIAction.ts
    - src/components/editor/SectionActionToolbar.tsx
    - src/components/editor/AIActionPreview.tsx
    - src/components/editor/RewriteDiffView.tsx
  modified:
    - src/components/editor/SectionEditorBlock.tsx
decisions:
  - "useSectionAIAction uses same raw fetch SSE pattern as useProposalGeneration — no buffering"
  - "Pre-action snapshot written to proposal_section_versions before streaming starts (D-02)"
  - "Version pruning: keep max 20 entries per section (oldest deleted)"
  - "Rewrite uses RewriteDiffView (two-column, higher friction); all other actions use AIActionPreview (inline)"
  - "Accept injects via editor.commands.setContent (D-05) then writes post-accept version entry"
  - "Discard for Rewrite shows confirmation dialog before calling REJECT_AI_ACTION"
metrics:
  duration_minutes: 10
  completed_date: "2026-03-27"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 08 Plan 02: Per-Section AI Action Toolbar & Preview System Summary

Per-section AI actions (Generate/Regenerate/Expand/Condense/Rewrite) with SSE streaming into a preview area, before/after diff for Rewrite, and pre-action snapshots to `proposal_section_versions`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useSectionAIAction hook and SectionActionToolbar | cb715e0 | src/hooks/useSectionAIAction.ts, src/components/editor/SectionActionToolbar.tsx |
| 2 | AIActionPreview and RewriteDiffView components | 1855e87 | src/components/editor/AIActionPreview.tsx, src/components/editor/RewriteDiffView.tsx, src/components/editor/SectionEditorBlock.tsx |

## What Was Built

**useSectionAIAction** (`src/hooks/useSectionAIAction.ts`): Hook that triggers AI actions for a specific section. Takes `proposalId`, `sectionKey`, `orgId`. On `triggerAction(actionType, currentContent)`:
1. Writes pre-action snapshot to `proposal_section_versions` with label `Before {ActionType}` (D-02)
2. Prunes versions table to max 20 entries per section
3. Dispatches `START_AI_ACTION` to workspace state
4. Calls `generate-proposal-section` edge function via raw `fetch()` SSE
5. Accumulates tokens and dispatches `UPDATE_AI_PREVIEW` on each chunk
6. Dispatches `COMPLETE_AI_STREAM` when stream ends; `REJECT_AI_ACTION` on error

**SectionActionToolbar** (`src/components/editor/SectionActionToolbar.tsx`): Fixed header toolbar per section. Shows "Generate Section" (jamo-500) when empty; "Regenerate", "Expand", "Condense", "Rewrite" (gray) when content exists. All buttons `min-h-[44px]` touch targets. `opacity-40 cursor-not-allowed pointer-events-none` when locked or streaming. Lock button always active (amber when locked). History clock icon button.

**AIActionPreview** (`src/components/editor/AIActionPreview.tsx`): Inline preview for Generate/Regenerate/Expand/Condense (D-03). `bg-blue-50 border border-blue-100` container. framer-motion appear animation with 0.5s delay. Streaming cursor (`animate-pulse`). Accept button flashes `#dcfce7` green for 400ms before calling `onAccept`. Decline always active.

**RewriteDiffView** (`src/components/editor/RewriteDiffView.tsx`): Before/after two-column diff for Rewrite (D-04). `grid-cols-2` layout, gray-50 left / white right. "Apply Rewrite" (jamo-500) disabled during streaming. "Discard" in `text-red-600` — shows confirmation dialog before calling `onDiscard`.

**SectionEditorBlock updates**: Replaced `data-slot="ai-action-preview"` placeholder with live rendering. When `editorState.ai_action` is non-null: renders `RewriteDiffView` for `type === 'rewrite'`, else `AIActionPreview`. Accept dispatches `ACCEPT_AI_ACTION` + `editor.commands.setContent(preview_content, true)` (D-05) + writes post-accept version entry. Decline dispatches `REJECT_AI_ACTION`.

## Decisions Made

- **useSectionAIAction uses same raw fetch SSE pattern** as useProposalGeneration — no buffering via supabase.functions.invoke
- **Pre-action snapshot written before streaming starts** (D-02) — ensures version exists even if user declines
- **Version pruning at 20** — keeps table manageable, oldest entries deleted first
- **Rewrite = higher friction** — two-column diff + confirm-before-discard; other actions = inline preview
- **Accept injects via setContent** (D-05) — TipTap command API only, never direct DOM mutation
- **orgId prop added to SectionEditorBlock** — needed for version writes; defaults to `''` for backward compat

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

## Known Stubs

None — all AI action paths are fully wired. SectionActionToolbar requires parent to wire `onAction` to `useSectionAIAction.triggerAction` — this integration is expected to happen in the SectionWorkspace component (Plan 03 or Phase 9 integration).

## Self-Check: PASSED

All 4 created files exist on disk. Both task commits (cb715e0, 1855e87) confirmed in git log.
