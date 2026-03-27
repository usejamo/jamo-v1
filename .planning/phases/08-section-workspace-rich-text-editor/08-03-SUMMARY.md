---
phase: 08-section-workspace-rich-text-editor
plan: "03"
subsystem: editor
tags: [version-history, section-nav, tiptap, overlay, restore]
dependency_graph:
  requires: ["08-01"]
  provides: ["VersionHistoryOverlay", "SectionNavPanel"]
  affects: ["SectionWorkspace"]
tech_stack:
  added: []
  patterns: ["framer-motion slide-in overlay", "status dot mapping", "D-11 restore via setContent"]
key_files:
  created:
    - src/components/editor/VersionHistoryOverlay.tsx
    - src/components/editor/SectionNavPanel.tsx
  modified:
    - src/components/editor/SectionWorkspace.tsx
decisions:
  - "AnimatePresence wraps the overlay backdrop+panel pair for exit animation"
  - "Restore flow snapshots pre-restore content to proposal_section_versions with label Before Restore before injecting via setContent"
  - "Status resolution prioritizes: generating > error > missing (no content) > needs-review (compliance flags) > complete"
metrics:
  duration: "15 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 2
  files_changed: 3
---

# Phase 08 Plan 03: Version History Overlay & Section Nav Summary

Version history overlay with AI action snapshots, diff-against-live view, and undoable restore. Section nav panel with status dots replacing the inline nav in SectionWorkspace.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | VersionHistoryOverlay component | 142e769 | src/components/editor/VersionHistoryOverlay.tsx |
| 2 | SectionNavPanel + SectionWorkspace wiring | 62ea542 | src/components/editor/SectionNavPanel.tsx, src/components/editor/SectionWorkspace.tsx |

## What Was Built

**VersionHistoryOverlay** (`src/components/editor/VersionHistoryOverlay.tsx`):
- Fixed-position panel (w-80) sliding in from the right with framer-motion
- Fetches from `proposal_section_versions` filtered by `proposal_id` + `section_key`, ordered `created_at DESC`, limit 20
- Shows action_label and formatted timestamps per version entry
- Diff view: side-by-side "Version content" (gray-50) vs "Current content" (white) rendered as HTML
- Restore button delegates to parent `onRestore(content, label)` — parent owns D-11 inject flow
- Loading ("Loading versions...") and empty ("No version history yet") states

**SectionNavPanel** (`src/components/editor/SectionNavPanel.tsx`):
- Left nav listing all sections in SECTION_WAVE_MAP order
- Status dots: green (complete), amber (needs-review), gray (missing), blue+pulse (generating), red (error)
- Active section highlighted with `border-jamo-500` left border + `bg-gray-50`
- Status resolution: generating > error > missing (no content) > needs-review (compliance_flags.length > 0) > complete

**SectionWorkspace wiring** (`src/components/editor/SectionWorkspace.tsx`):
- Replaced inline `<nav>` with `<SectionNavPanel>` component
- Renders `<VersionHistoryOverlay>` when `state.version_history_open` is non-null
- D-11 restore flow: snapshot pre-restore as "Before Restore" version entry → inject via `editorRefs.current.get(sectionKey)?.setContent(restoredContent)` → dispatch `CLOSE_VERSION_HISTORY`

## Decisions Made

1. `AnimatePresence` wraps both the backdrop div and motion panel so exit animation plays on close
2. Restore snapshots current content to DB before injecting — preserves the "before restore" state for future history
3. Status logic: `missing` = no content string; `needs-review` = compliance_flags present; `complete` = explicit status + no flags

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — VersionHistoryOverlay fetches real data from `proposal_section_versions`. SectionNavPanel reads real section state. Restore writes real snapshot to DB.

## Self-Check: PASSED

- src/components/editor/VersionHistoryOverlay.tsx — FOUND
- src/components/editor/SectionNavPanel.tsx — FOUND
- src/components/editor/SectionWorkspace.tsx — FOUND (modified)
- Commit 142e769 — FOUND
- Commit 62ea542 — FOUND
- npm run test:run — 263 passing, 63 skipped, pre-existing failures in other worktrees unrelated to this plan
