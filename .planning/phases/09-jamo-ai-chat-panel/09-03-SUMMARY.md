---
phase: 09-jamo-ai-chat-panel
plan: "03"
subsystem: ai-chat
tags: [chat, streaming, sse, supabase, edit-proposals, gap-injection]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [live-chat-streaming, edit-accept-reject, gap-badge, proposal-chats-persistence]
  affects: [src/components/AIChatPanel.tsx, src/pages/ProposalDetail.tsx, src/components/editor/SectionWorkspace.tsx]
tech_stack:
  added: []
  patterns: [supabase-functions-invoke-sse, streaming-content-accumulation, edit-proposal-inject]
key_files:
  created: []
  modified:
    - src/components/AIChatPanel.tsx
    - src/pages/ProposalDetail.tsx
    - src/components/editor/SectionWorkspace.tsx
decisions:
  - "activeSectionKey lifted via onActiveSectionChange callback on SectionWorkspace — AIChatPanel is outside SectionWorkspaceProvider tree"
  - "StreamingContent accumulated in state then merged into messages on [DONE] to avoid layout thrash"
  - "handleAcceptEdit calls insertContentAt(0, content) via editorRefs Map — D-07 pattern"
metrics:
  duration_minutes: 25
  completed_date: "2026-03-30"
  tasks_completed: 4
  files_modified: 3
---

# Phase 09 Plan 03: Live Chat Streaming & Edit Proposals Summary

**One-liner:** Live SSE streaming from chat-with-jamo Edge Function with edit-proposal Accept/Reject, gap badge, and proposal_chats persistence — all demo code removed.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Update AIChatPanel props interface and imports | 4acb28a | Complete (pre-implemented) |
| 2 | Replace handleSubmit with live SSE streaming | 4acb28a | Complete (pre-implemented) |
| 3 | Edit proposal Accept/Reject flow | 4acb28a | Complete (pre-implemented) |
| 4 | Rail badge + gap message sequencing | 4acb28a | Complete (pre-implemented) |

## What Was Built

### AIChatPanel.tsx — Fully wired, no demo code

- **Props interface:** `proposalId`, `orgId`, `draftGenerated`, `sections`, `editorRefs`, `activeSectionKey`, `gapCount`, `onGapsConsumed` — all demo props removed
- **handleSubmit:** Calls `supabase.functions.invoke('chat-with-jamo')`, reads SSE ReadableStream, accumulates `streamingContent`, merges on `[DONE]`
- **Intent routing:** SSE `{type: 'intent'}` event sets `currentIntent`; `edit` intent renders `ChatEditPreview` during streaming
- **ChatEditPreview:** Sub-component with Accept/Reject buttons; Accept calls `editorRefs.current.get(targetKey).insertContentAt(0, content)`; Reject marks message type as `chat`
- **Rail badge:** `SpectrumSparkle` renders `gapCount` with `animate-pulse` when > 0
- **Gap injection:** On first panel open with `gapCount > 0`, injects intro + up to 2 individual gap messages + consolidation if needed; calls `onGapsConsumed()`
- **Explain chip:** Visible only when `activeSectionKey` is set; submits "Explain this section"
- **Persistence:** User and assistant messages inserted to `proposal_chats` with `section_target_id` and `message_type`

### ProposalDetail.tsx — Clean prop wiring

- Removed `React.ComponentType<any>` cast
- Added `activeSectionKey` state lifted from `SectionWorkspace`
- Passes `activeSectionKey` to `AIChatPanel`

### SectionWorkspace.tsx — Active section exposure

- Added `onActiveSectionChange?: (sectionKey: string | null) => void` prop
- `useEffect` fires callback when `state.active_section` changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing wiring] ProposalDetail still used React.ComponentType<any> cast**
- **Found during:** Post-task verification
- **Issue:** `ProposalDetail.tsx` used `React.ComponentType<any>` cast and passed stale props (`onCommand`, `onSuggestionResolved`, `lastResolution`) — AIChatPanel props interface had been updated but the call site had not
- **Fix:** Removed cast, removed stale props, added `activeSectionKey` prop wired from new `onActiveSectionChange` callback on `SectionWorkspace`
- **Files modified:** `src/pages/ProposalDetail.tsx`, `src/components/editor/SectionWorkspace.tsx`
- **Commit:** b936caa

**2. [Pre-existing] SectionWorkspace.tsx had no mechanism to expose active section to parent**
- **Found during:** Architectural research
- **Issue:** `SectionWorkspaceProvider` wraps only `SectionWorkspaceInner` — `AIChatPanel` is rendered in `ProposalDetail` outside that provider tree, so `useSectionWorkspace()` was not available
- **Fix:** Added `onActiveSectionChange` callback prop that fires via `useEffect` on `state.active_section` change
- **Files modified:** `src/components/editor/SectionWorkspace.tsx`
- **Commit:** b936caa

## Known Stubs

None — all features wired to live Edge Function and Supabase persistence.

## Verification

```
grep "chat-with-jamo" src/components/AIChatPanel.tsx   ✓ (2 occurrences)
grep "insertContentAt" src/components/AIChatPanel.tsx  ✓ (1 occurrence)
grep "proposal_chats" src/components/AIChatPanel.tsx   ✓ (2 occurrences)
grep "gapCount" src/components/AIChatPanel.tsx         ✓ (5 occurrences)
npx vitest run: 129 passed, 17 skipped, 0 failed
TypeScript (AIChatPanel.tsx): 0 errors
```

## Self-Check: PASSED

- `src/components/AIChatPanel.tsx` exists and contains all key patterns
- `src/pages/ProposalDetail.tsx` uses `AIChatPanel` without cast
- `src/components/editor/SectionWorkspace.tsx` exports `onActiveSectionChange` prop
- Commits 4acb28a and b936caa confirmed in git log
