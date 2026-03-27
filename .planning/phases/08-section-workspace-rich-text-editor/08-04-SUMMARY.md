---
phase: 08-section-workspace-rich-text-editor
plan: "04"
subsystem: editor-quality-gates
tags: [compliance, consistency, tiptap, haiku, edge-function]
dependency_graph:
  requires: ["08-02", "08-03"]
  provides: ["compliance-flags", "consistency-check-banner"]
  affects: ["src/components/editor/SectionEditorBlock.tsx", "src/components/editor/SectionWorkspace.tsx"]
tech_stack:
  added: ["framer-motion (motion.div for banner animation)"]
  patterns: ["two-pass compliance (rule-based + Haiku)", "accept-time compliance trigger (D-13)", "auto-trigger after all-complete (D-12)"]
key_files:
  created:
    - src/hooks/useComplianceCheck.ts
    - src/components/editor/ComplianceFlag.tsx
    - src/components/editor/ConsistencyCheckBanner.tsx
    - supabase/functions/consistency-check/index.ts
  modified:
    - src/components/editor/SectionEditorBlock.tsx
    - src/components/editor/SectionWorkspace.tsx
decisions:
  - "Two-pass compliance: rule-based first (word count, placeholders, section keywords), Haiku only if rules pass (D-14)"
  - "Compliance fires on accept, not on stream complete (D-13)"
  - "ConsistencyCheckBanner auto-triggers after all sections reach complete status (D-12)"
  - "Consistency check is fire-and-forget with silent failure — non-blocking"
metrics:
  duration_minutes: 12
  completed_date: "2026-03-27"
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 08 Plan 04: Compliance Flags & Consistency Check Summary

Two-pass compliance checking (rule-based + Haiku-on-accept) and cross-section consistency check (auto-trigger after full generation) via new hook, components, and Deno edge function.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | ComplianceFlag component and useComplianceCheck hook | 120eda3 | src/hooks/useComplianceCheck.ts, src/components/editor/ComplianceFlag.tsx, SectionEditorBlock.tsx |
| 2 | ConsistencyCheckBanner and consistency-check Edge Function | a8edc58 | supabase/functions/consistency-check/index.ts, src/components/editor/ConsistencyCheckBanner.tsx, SectionWorkspace.tsx |

## What Was Built

### useComplianceCheck (src/hooks/useComplianceCheck.ts)
Two-pass compliance logic invoked on accept (D-13):
- Pass 1 (rule-based, instant): word count < 50 warning, `[PLACEHOLDER:...]` detection, section-type keyword checks (safety_reporting → adverse events, study_understanding → therapeutic area)
- Pass 2 (Haiku, only if rules pass): invokes `compliance-check` edge function via `supabase.functions.invoke`, maps response to `ComplianceFlag[]` with `type: 'fail'|'warning'` and `source: 'haiku'`
- Network errors dispatch a single warning flag silently

### ComplianceFlag / ComplianceFlagList (src/components/editor/ComplianceFlag.tsx)
- `ComplianceFlag`: amber chip (`bg-amber-100 text-amber-800`) for warnings, red chip (`bg-red-100 text-red-700`) for fails, with exclamation triangle SVG
- `ComplianceFlagList`: renders "Checking compliance..." italic text when checking, flex-wrapped chips when flags present, null when no flags (silent pass per UI-SPEC)

### SectionEditorBlock.tsx (modified)
- Imports and wires `useComplianceCheck` + `ComplianceFlagList`
- Replaced `data-slot="compliance-flags"` placeholder div with `<ComplianceFlagList flags={editorState.compliance_flags} checking={editorState.compliance_checking} />`
- `checkCompliance(sectionKey, aiAction.preview_content)` called after `editor.commands.setContent` in accept handler (D-13)

### consistency-check Edge Function (supabase/functions/consistency-check/index.ts)
- Accepts `{ sections: Array<{ section_key, content }> }`, validates >= 2 sections
- Calls `claude-haiku-4-5-20251001` with cross-section consistency system prompt
- Checks for: budget disagreements, timeline conflicts, scope contradictions, staffing inconsistencies
- Returns `{ flags: Array<{ message, sections_involved }> }` with CORS headers
- JSON parse with regex fallback (same pattern as extract-assumptions)

### ConsistencyCheckBanner (src/components/editor/ConsistencyCheckBanner.tsx)
- `motion.div` with `initial={{ opacity: 0, y: -8 }}` entry animation
- `bg-amber-50 border border-amber-200` container, "Cross-Section Review" heading
- Dismiss button (X SVG) calls `onDismiss`
- Flag list: `sections_involved` shown as gray suffix per flag
- Returns null when no flags (silent)

### SectionWorkspace.tsx (modified)
- `consistencyChecked` ref prevents duplicate triggers
- `useEffect` watching `state.sections`: triggers `consistency-check` invoke when all sections are `complete`
- Dispatches `SET_CONSISTENCY_FLAGS` with UUID-stamped flags
- Renders `<ConsistencyCheckBanner>` above editors when `consistency_flags.length > 0 && !consistency_dismissed`
- `DISMISS_CONSISTENCY` dispatch on banner close

## Decisions Made

1. **Two-pass compliance**: Rule-based first (free, instant), Haiku only if rules pass — avoids unnecessary AI calls (D-14)
2. **Accept-time trigger**: Compliance fires on accept, not on stream complete — respects D-13 so users aren't interrupted during streaming
3. **Consistency check is non-blocking**: Fire-and-forget with `.catch(() => {})` — network failure does not surface to user
4. **No compliance-check edge function created in this phase**: Per plan spec, the client invokes `compliance-check` via `supabase.functions.invoke`; the edge function is expected to be deployed separately

## Requirements Satisfied

- **REQ-5.7**: Cross-section consistency check auto-triggers after all sections complete generation
- **REQ-5.8**: Compliance flags render inline as amber/red chips below section card

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all flags render from live data (rule evaluation + Haiku response). No hardcoded empty values flow to UI.

## Self-Check: PASSED
