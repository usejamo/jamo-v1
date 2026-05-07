---
phase: "13"
plan: "03"
subsystem: dashboard
tags: [dashboard, usage-events, kpi, live-data, cleanup]
dependency_graph:
  requires:
    - "13-01"
    - "13-02"
  provides:
    - Dashboard with live data sources (no demo constants)
    - Generated This Month KPI from usage_events
  affects:
    - src/pages/Dashboard.tsx
    - src/types/proposal.ts
    - src/context/ProposalsContext.tsx
tech_stack:
  added: []
  patterns:
    - usage_events supabase query scoped by org_id + month filter
    - timeAgo() relative time helper replacing hardcoded LAST_ACTIVITY dict
    - STATUS_LABELS/STATUS_COLORS imported from shared StatusSelector component
key_files:
  created: []
  modified:
    - src/pages/Dashboard.tsx
    - src/types/proposal.ts
    - src/context/ProposalsContext.tsx
decisions:
  - "updatedAt made optional on Proposal type — DB-computed field not provided on create"
  - "event_type strings: proposal_generated and ai_section_call (plan-specified; not yet written by Edge Functions)"
  - "timeAgo returns '—' for missing updatedAt — safe fallback for proposals without updated_at in DB"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-05-07"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 13 Plan 03: Dashboard Demo Constant Cleanup & Generation Metrics Summary

One-liner: Dashboard rewritten with live data signals — DEMO_NOW/WIN_RATE/LAST_ACTIVITY/Salesforce/Workday removed, inactivity wired to `proposals.updated_at`, "Generated This Month" KPI reads `usage_events` scoped by org and calendar month.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove demo constants and fix inactivity signal | ea36c6e | Dashboard.tsx, proposal.ts, ProposalsContext.tsx |
| 2 | Add Generated This Month KPI card from usage_events | 526fa5e | Dashboard.tsx |

## What Was Built

**Task 1 — Demo constant removal:**
- Deleted `DEMO_NOW`, `WIN_RATE`, `LAST_ACTIVITY` constants from Dashboard.tsx
- Replaced all `DEMO_NOW` references with `new Date()` in `getUrgencyTag()` and `isUrgent()`
- Removed locally-defined `STATUS_LABELS`/`STATUS_COLORS`; now imported from `StatusSelector`
- Added `timeAgo()` helper; Priority Focus "Last Activity" column uses `p.updatedAt` (DB `updated_at`)
- Stripped fake `source="Data source: Salesforce Production Environment"`, `weighted`, `weightedBadge` props from Pipeline Value StatCard
- Added `updatedAt?: string` to Proposal interface; `mapRow` maps `updated_at` from DB row

**Task 2 — Generated This Month KPI:**
- Added `generatedCount` + `aiCallCount` useState
- Added useEffect fetching `usage_events` filtered by `org_id` + current month start
- Counts `event_type === 'proposal_generated'` and `event_type === 'ai_section_call'`
- Replaced Win Rate StatCard with Generated This Month StatCard (purple accent)
- Sub-label shows AI call count or "No AI calls yet this month" when zero

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] updatedAt caused type error in createProposal calls**
- **Found during:** Task 1 TSC verification
- **Issue:** Adding `updatedAt: string` (required) to Proposal broke `Omit<Proposal, 'id' | 'createdAt'>` in ProposalCreationWizard and ProposalEditorModal — both pass create objects without `updatedAt`
- **Fix:** Made `updatedAt?: string` (optional) — it's a DB-computed field, not a caller-supplied field. Updated `timeAgo()` and `isUrgent()` to handle undefined gracefully
- **Files modified:** src/types/proposal.ts, src/pages/Dashboard.tsx
- **Commit:** ea36c6e

## Known Stubs

None. `generatedCount` and `aiCallCount` are wired to live `usage_events` query. The counts will show 0 until Edge Functions write events with those `event_type` values — this is expected behavior, not a stub.

## Threat Surface Scan

T-13-06 (usage_events query) — mitigated as planned: query explicitly filters by `profile.org_id` AND Supabase RLS enforces org isolation (double-gated). No new unplanned surface introduced.

## Self-Check: PASSED

- `src/pages/Dashboard.tsx` exists: FOUND
- `src/types/proposal.ts` has `updatedAt?`: FOUND
- `src/context/ProposalsContext.tsx` maps `updated_at`: FOUND
- Commit ea36c6e exists: FOUND
- Commit 526fa5e exists: FOUND
- grep "DEMO_NOW|WIN_RATE|LAST_ACTIVITY|Salesforce|Workday" Dashboard.tsx → 0 matches
- grep "Generated This Month" Dashboard.tsx → match
- grep "usage_events" Dashboard.tsx → match
- grep "from.*StatusSelector" Dashboard.tsx → match
- Tests: 30 failed (pre-existing) / 239 passed — no new failures
