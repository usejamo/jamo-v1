# Phase 13: Dashboard & Proposal Lifecycle — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 13-dashboard-proposal-lifecycle
**Areas discussed:** Status Transition UI, Urgency Signal Source, Generation Metrics Placement, Status Label (in_review vs in_progress)

---

## Status Transition UI

| Option | Description | Selected |
|--------|-------------|----------|
| ProposalsList inline | Status badge becomes a dropdown — quick changes without navigating away | |
| ProposalDetail header only | Status dropdown in proposal workspace toolbar | |
| Both locations | Shared component, two variants — list for triage, detail for finalizing | ✓ |

**User's choice:** Both locations — shared `StatusSelector` component with compact badge variant (list) and labeled variant (detail header).

**Notes:** Terminal transitions to `won`/`lost` require confirmation — misclicks in a dense list are likely. All other transitions are one-click. Bulk updates and audit logging explicitly called out of scope. "Mark as submitted" moment naturally fires in ProposalDetail after finalizing; pipeline triage happens in ProposalsList.

---

## Urgency Signal Source

| Option | Description | Selected |
|--------|-------------|----------|
| Use updated_at | Already exists, updates on any save/edit/status change/AI action | ✓ |
| Drop inactivity signal | Only keep due-within-72h urgency | |
| Add last_activity_at column | Dedicated column, most accurate, requires migration | |

**User's choice:** `proposals.updated_at` with 48h threshold.

**Notes:** Breadth of signal (status changes count as activity) is desirable — a proposal moved forward yesterday isn't really stale. Friday-to-Monday gaps flagged as potential noise to tune later. Stale-proposal surfacing is genuinely useful for CRO teams juggling multiple deadlines. `last_activity_at` remains a future option if `updated_at` proves too noisy.

---

## Generation Metrics Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Replace Win Rate card | Keep 3-card layout, Win Rate → Generated this month | ✓ |
| Add a 4th card | Expand to 4-column grid | |
| Separate metrics row | Secondary row below existing KPI cards | |

**User's choice:** Replace Win Rate KPI card with "Generated this month" (proposals generated + AI calls, current calendar month from `usage_events`).

**Notes:** Win Rate is misleading on small sample — 3 closed proposals showing 33% creates confusion. Generation metrics are useful from day one and reinforce the product's core value. Win Rate deferred to V2 analytics view (not dropped — noted as deferred item).

---

## Status Label: in_review vs in_progress

| Option | Description | Selected |
|--------|-------------|----------|
| Relabel only | Keep DB value `in_review`, change UI label to "In Progress" | |
| Full rename | Postgres migration + TypeScript types + all code references | ✓ |

**User's choice:** Full rename `in_review` → `in_progress`.

**Notes:** Label-only approach leaves technical debt that compounds as more code references the enum. Phase 13 is the right moment because status code is already being touched for the shared selector — one coherent change set. Pre-flight check: scan RLS policies and DB functions for `in_review` string references before writing the migration.

---

## Claude's Discretion

- Exact confirmation dialog design for won/lost transitions
- Loading/pending state during Supabase status write
- Empty state for "Generated this month" card when no usage data exists
- Whether to retain `WIN_RATE` constant as calculation placeholder

## Deferred Ideas

- Win Rate — V2 analytics view once meaningful sample size exists
- `last_activity_at` dedicated column — if `updated_at` proves too noisy
- Bulk status updates — future ProposalsList multi-select
- Audit log for status changes — post-MVP compliance feature
- Friday-Monday threshold tuning — 48h may need relaxation to ~96h
