---
phase: 12
plan: "02"
subsystem: salesforce-ui
tags: [react, vitest, settings, oauth, tailwind, testing-library]
dependency_graph:
  requires: ["12-01"]
  provides: ["SalesforceConnection", "settings-integrations-salesforce"]
  affects: ["settings-integrations-tab"]
tech_stack:
  added:
    - "@testing-library/react for SalesforceConnection component tests"
  patterns:
    - "Inline vi.mock (not dynamic import) for supabase — avoids OOM on full supabase-js resolve"
    - "useSearchParams + window.history.replaceState for sf_error URL cleanup on mount"
    - "D-16 graceful degradation: data ?? null in maybeSingle().then() — never throws"
key_files:
  created:
    - src/components/SalesforceConnection.tsx
  modified:
    - src/pages/Settings.tsx
    - tests/SalesforceConnection.test.tsx
decisions:
  - "Component reads orgId internally via useAuth() — no props needed, consistent with D-10"
  - "sf_error useEffect runs once on mount (empty dep array) — matches D-15 single-read contract"
  - "fetchLoading skeleton replaces entire footer row (not just button) — matches UI-SPEC.md loading pattern"
  - "Disconnect button uses red-* colors; Connect button uses jamo-* colors — matches UI-SPEC.md color contract"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-06"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 12 Plan 02: SalesforceConnection UI Component Summary

**One-liner:** SalesforceConnection React component with disconnected/connected/error states, D-15 URL cleanup, D-16 graceful degradation, wired into Settings Integrations grid with 12 passing unit tests.

## What Was Built

### Task 1: SalesforceConnection component

`src/components/SalesforceConnection.tsx` — full implementation of all 3 states per UI-SPEC.md:

| State | Trigger | UI |
|-------|---------|---|
| Disconnected | null from salesforce_connections | Production/Sandbox radio + "Connect Salesforce" button |
| Connected | non-null from salesforce_connections | sf_username + "Disconnect" button + green Connected badge |
| Error | sf_error query param on mount | Inline dismissible banner (role=alert) with D-14 copy |
| Fetch loading | initial DB query in flight | animate-pulse skeleton in footer row |
| Connecting | Connect button clicked | Spinner + "Connecting…", button disabled+opacity-60 |
| Disconnecting | Disconnect button clicked | Spinner + "Disconnecting…", button disabled+opacity-60 |

Key implementation details:
- `SF_ERROR_COPY` record maps 5 error codes to exact D-14 user-facing messages; unknown keys fall back to `'unknown'`
- `window.history.replaceState` strips `sf_error` from URL immediately on mount (D-15)
- `maybeSingle().then(({ data, error }) => setConnection(data ?? null))` — error on fetch = disconnected, never throws (D-16, REQ-12.6)
- `supabase.functions.invoke('salesforce-oauth-initiate', ...)` and `supabase.functions.invoke('salesforce-oauth-disconnect', ...)` for OAuth flows
- All accessibility requirements met: `role="alert"`, `aria-label="Dismiss error"`, `aria-label="Salesforce connected"`, `role="status" aria-label="Loading"`

### Task 2: Settings.tsx + test activation

**Settings.tsx changes:**
- Added `import { SalesforceConnection } from '../components/SalesforceConnection'`
- Removed Salesforce object from `INTEGRATIONS` array (HubSpot + Workday remain — 2 entries)
- Inserted `<SalesforceConnection />` as first child of `grid grid-cols-3 gap-5` — grid stays 3-wide (1 dynamic + 2 static)

**tests/SalesforceConnection.test.tsx:**
- Converted all 12 `it.skip` stubs to real passing tests
- Inline `vi.mock('../src/lib/supabase', ...)` — not dynamic import (avoids OOM per STATE.md Active Decisions)
- `setMaybeSingleResult()` helper overrides mock per-test for connected/error scenarios
- All 12 tests pass: `vitest run tests/SalesforceConnection.test.tsx` → 12 passed

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `147084e` | `feat(12-02): add SalesforceConnection component` |
| Task 2 | `a7fce4a` | `feat(12-02): wire SalesforceConnection into Settings + activate 12 unit tests` |

## Deviations from Plan

None — plan executed exactly as written.

- Component structure matches UI-SPEC.md layout exactly (card outer, header row, error banner, footer row)
- All 5 D-14 error codes implemented in SF_ERROR_COPY
- D-15 URL cleanup: regex strip on mount
- D-16 graceful degradation: `data ?? null` in fetch callback
- Settings.tsx: Salesforce removed from INTEGRATIONS, SalesforceConnection first in grid
- 12 tests activated (no it.skip remaining)

## Pre-existing Test Failures (Out of Scope)

Full suite run shows 41 failures across 27 test files. Breakdown:
- 26 test files are in other worktrees (`.claude/worktrees/agent-*/`) — not caused by this plan
- Pre-existing failures in main project (documented in 12-01-SUMMARY.md):
  - `src/components/SectionStreamCard.test.tsx` — 1 failure
  - `src/components/settings/TemplatesTab.test.tsx` — 4 failures
  - `src/components/editor/__tests__/SectionEditorBlock.test.tsx` — 2 failures
  - `src/components/editor/__tests__/SectionWorkspace.test.tsx` — 1 failure

No new failures introduced by this plan.

## Known Stubs

None. All states fully wired:
- DB fetch: live `supabase.from('salesforce_connections')` query
- Connect: live `supabase.functions.invoke('salesforce-oauth-initiate')`
- Disconnect: live `supabase.functions.invoke('salesforce-oauth-disconnect')`

Runtime behavior depends on Salesforce Connected App secrets (`SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`) being set as Edge Function environment variables — per D-04, this is a human prerequisite, not a code stub.

## Threat Surface Scan

Threat mitigations from plan's `<threat_model>`:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-12-08 Spoofing (sf_error param) | SF_ERROR_COPY record used — unknown keys fall back to 'unknown'; raw Salesforce error never rendered; param stripped from URL on mount |
| T-12-09 Information Disclosure (salesforce_connections fetch) | Fetches only `sf_username, is_sandbox` (non-secret); RLS enforced server-side |
| T-12-10 DoS (failed fetch blocks page) | `data ?? null` in fetch callback; `setFetchLoading(false)` always called; no thrown errors |

No new threat surface introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

Files confirmed present:
- `src/components/SalesforceConnection.tsx` — created
- `src/pages/Settings.tsx` — modified (SalesforceConnection imported + inserted, Salesforce removed from INTEGRATIONS)
- `tests/SalesforceConnection.test.tsx` — 12 real tests (no it.skip)

Commits confirmed in git log:
- `147084e` feat(12-02): add SalesforceConnection component
- `a7fce4a` feat(12-02): wire SalesforceConnection into Settings + activate 12 unit tests
