# Phase 13: Dashboard & Proposal Lifecycle — Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 wires the existing dashboard UI to live Supabase data, adds proposal status transitions, replaces hardcoded demo constants with real signals, and adds generation metrics from `usage_events`. The existing visual design is preserved throughout — this phase is about data wiring, not layout changes.

**In scope:**
- Replace Dashboard hardcoded constants (DEMO_NOW, LAST_ACTIVITY, WIN_RATE, fake Salesforce/Workday labels) with live data
- Add a shared `StatusSelector` component; wire into ProposalsList inline and ProposalDetail header
- Replace Win Rate KPI card with "Generated this month" sourced from `usage_events`
- Rename DB enum value `in_review` → `in_progress` with full migration + code sweep
- ProposalsList filters (active / archived / deleted) all hitting Supabase

**Out of scope:**
- Win Rate (deferred to V2 analytics)
- Bulk status updates
- Audit logging for status changes
- `last_activity_at` dedicated column (future if `updated_at` proves too noisy)
- Any Salesforce reads or write-back (Phase 12.1)

</domain>

<decisions>
## Implementation Decisions

### Status Transitions

- **D-01:** Build a single shared `StatusSelector` component with **two visual variants**:
  - **Compact badge variant** — for ProposalsList inline. Status badge becomes a dropdown trigger. Used in dense list rows.
  - **Labeled variant** — for ProposalDetail header/toolbar. Full labeled control for the "mark as submitted" moment after finalizing a proposal.
- **D-02:** Terminal transitions to `won` or `lost` **require a confirmation step** — misclicks in a dense list are likely and these are meaningful pipeline events.
- **D-03:** All other transitions (draft → in_progress, in_progress → submitted, etc.) are **one-click** — no confirmation dialog.
- **D-04:** Bulk status updates are **out of scope**. Single-proposal transitions only.
- **D-05:** Audit logging for status changes is **out of scope** for this phase.

### Urgency Signal (Priority Focus)

- **D-06:** Use `proposals.updated_at` as the inactivity signal. It updates on any save, edit, status change, or AI action — a reasonable proxy for "someone is engaging with this proposal."
- **D-07:** Keep the existing **48h threshold** for inactivity. Note: Friday-to-Monday gaps may create noise once real usage patterns emerge — threshold should be revisited in V2 analytics.
- **D-08:** Replace hardcoded `DEMO_NOW` with `new Date()` (real current time).
- **D-09:** Remove hardcoded `LAST_ACTIVITY` dict entirely — use `updated_at` from the Supabase proposals query instead.
- **D-10:** No new DB column (`last_activity_at`) in this phase — `updated_at` is sufficient. A dedicated column can be added later if `updated_at` proves too noisy.

### Generation Metrics

- **D-11:** **Replace the Win Rate KPI card** with a "Generated this month" card. Win Rate is misleading on small sample sizes (3 closed proposals showing 33% win rate creates confusion) and won't be meaningful for months.
- **D-12:** "Generated this month" card shows **two metrics**: proposals generated + AI calls made, scoped to the current calendar month.
- **D-13:** Source from `usage_events` table (already exists with org RLS from Phase 1). Query: filter by `org_id`, current month, relevant event types.
- **D-14:** Win Rate is **deferred to V2 analytics** — not dropped, just waiting for meaningful sample size.
- **D-15:** Remove fake "Data source: Salesforce Production Environment" and "via Workday" demo labels from Pipeline Value card.

### Status Naming: in_review → in_progress

- **D-16:** **Full rename** `in_review` → `in_progress` — not a label-only change. Postgres migration renaming the enum value + TypeScript type update + sweep of all code references.
- **D-17:** Scope of rename: Postgres migration, TypeScript `ProposalStatus` type, all status conditionals/filters, RLS policies that reference `in_review` by name, UI labels, hardcoded strings in Dashboard.tsx and ProposalsList.tsx.
- **D-18:** User-facing label reads **"In Progress"** everywhere it renders after the rename.
- **D-19:** Before building: check all RLS policies and DB functions for `in_review` string references — these must be updated in the same migration to avoid breakage.

### ProposalsList Filters

- **D-20:** Archived and deleted ProposalsList tabs must query Supabase directly — not filter in-memory from ID sets.
- **D-21:** Archived query: `is_archived = true AND deleted_at IS NULL`.
- **D-22:** Deleted query: `deleted_at IS NOT NULL` (soft-delete pattern from Phase 1).

### Claude's Discretion

- Exact confirmation dialog design for won/lost transitions (modal vs inline)
- Loading/pending state for status change while Supabase write is in flight
- Empty state content for "Generated this month" card when no usage data exists yet
- Whether to remove `WIN_RATE = 0.67` entirely or retain it as a future calculation placeholder

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §M1-11 — REQ-11.1 through REQ-11.4 (dashboard lifecycle requirements)

### Existing Code — Primary Files to Modify
- `src/pages/Dashboard.tsx` — KPI cards, Priority Focus, Pipeline; hardcoded constants to remove
- `src/pages/ProposalsList.tsx` — status filters, archived/deleted tabs, inline status badge
- `src/pages/ProposalDetail.tsx` — header/toolbar; labeled StatusSelector variant goes here
- `src/context/ProposalsContext.tsx` — already Supabase-backed; add `updateStatus` method
- `src/types/proposal.ts` — `ProposalStatus` type; `in_review` → `in_progress` rename here

### Database
- `.planning/STATE.md` §Active Decisions — `usage_events` table structure, org RLS pattern
- Supabase migration files in `supabase/migrations/` — check for `in_review` references in RLS policies before writing the enum rename migration

### Architecture
- `.planning/PROJECT.md` §Architecture Principles — "Demo visual design preserved throughout"
- `.planning/PROJECT.md` §10 (Proposal Lifecycle Dashboard) — Win Rate deferred scope note

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StatusSelector` (new) — builds on existing `STATUS_LABELS` and `STATUS_COLORS` constants already defined in both Dashboard.tsx and ProposalsList.tsx; extract these to a shared location
- `ProposalsContext.updateProposal` — already exists; `updateStatus` can be a thin wrapper around it
- `useAuth().profile.org_id` — available app-wide; needed for `usage_events` query scoping

### Established Patterns
- Supabase queries follow `.from('table').select().eq('org_id', orgId)` pattern — RLS enforced + explicit org filter
- `updateProposal` in ProposalsContext optimistically updates local state after Supabase write
- ArchivedContext and DeletedContext currently hold only ID sets — these will need to be bypassed or extended for the full list query

### Integration Points
- Dashboard already reads from `useProposals()` — KPI data is already live from Phase 1; this phase only removes demo constants and adds generation metrics
- `usage_events` table: query `event_type IN ('proposal_generated', 'ai_section_call')` or equivalent event names (verify actual event names written in Phase 1/7 code)
- `proposals.updated_at` is auto-managed by Postgres `updated_at` trigger (set in Phase 1 migrations)

### Hardcoded Demo Artefacts to Remove
- `DEMO_NOW = new Date('2026-02-26T12:00:00')` in Dashboard.tsx and ProposalsList.tsx
- `LAST_ACTIVITY` record dict in Dashboard.tsx
- `WIN_RATE = 0.67` constant in Dashboard.tsx
- "Data source: Salesforce Production Environment" label in Pipeline Value card
- "via Workday" badge in Pipeline Value card

</code_context>

<specifics>
## Specific Ideas

- The "Generated this month" card should reinforce Jamo's core value prop (AI-assisted drafting volume) — framing like "12 proposals drafted" + "47 AI calls" communicates value to the user from day one
- Friday-to-Monday inactivity gaps: the 48h threshold may need to be relaxed to ~96h or made day-of-week aware in a future iteration
- `in_review` → `in_progress` rename: this is the right moment because Phase 13 already touches all status-related code for the shared selector — one coherent change set rather than a future cleanup

</specifics>

<deferred>
## Deferred Ideas

- **Win Rate (V2 analytics):** Return once org has meaningful closed-proposal data (10+ decisions). Will need its own analytics view with sample-size warnings.
- **`last_activity_at` column:** Dedicated column updated at meaningful events (section generated, chat sent, status changed). Add if `updated_at` proves too noisy in practice.
- **Bulk status updates:** Could be added to ProposalsList with multi-select in a future phase.
- **Audit log for status changes:** Track who changed what and when — useful for compliance; deferred to post-MVP.
- **Friday-Monday threshold tuning:** 48h threshold revisit once real usage patterns emerge.

</deferred>

---

*Phase: 13-dashboard-proposal-lifecycle*
*Context gathered: 2026-05-07*
