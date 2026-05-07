---
status: partial
phase: 13-dashboard-proposal-lifecycle
source: [13-VERIFICATION.md]
started: 2026-05-07T00:00:00Z
updated: 2026-05-07T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. DB has no in_review rows
expected: SQL `SELECT COUNT(*) FROM proposals WHERE status = 'in_review'` returns 0
result: [pending]

### 2. StatusSelector compact — dropdown + confirmation modal in ProposalsList
expected: Clicking a status badge in the proposals list opens a dropdown. Selecting 'Won' or 'Lost' shows a confirmation modal before applying. Selecting any other status applies immediately.
result: [pending]

### 3. StatusSelector labeled — interaction in ProposalDetail header
expected: Proposal detail page shows a labeled status selector in the header. Clicking it opens a dropdown. Terminal transitions (won/lost) require confirmation; others apply immediately.
result: [pending]

### 4. Dashboard "Generated This Month" card shows real data
expected: Dashboard KPI card labeled "Generated This Month" displays a non-placeholder count sourced from usage_events for the current org.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
