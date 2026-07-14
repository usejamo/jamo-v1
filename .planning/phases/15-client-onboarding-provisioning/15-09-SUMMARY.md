---
phase: 15-client-onboarding-provisioning
plan: 09
subsystem: ui
tags: [react, supabase-functions, tailwind, admin-panel]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning
    provides: "deployed admin-create-org / admin-invite-first-admin / admin-invites-lifecycle edge functions (plan 08)"
provides:
  - "AdminPanel.tsx page: org list, create-org form w/ live slug preview, invite-first-admin dialog, pending-invites list w/ resend/revoke"
affects: ["15-11 (SuperAdminRoute + /admin route wiring)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AdminPanel reuses TemplatesTab.tsx's row/pill-badge/44px-icon-action/DeleteDialog chrome verbatim, matching UI-SPEC"
    - "All cross-org writes route through supabase.functions.invoke('admin-*') — no direct client writes to organizations/invites"

key-files:
  created: [src/pages/admin/AdminPanel.tsx]
  modified: []

key-decisions:
  - "Org list fetched directly via supabase.from('organizations').select() (read-only, relies on the existing orgs_super_admin RLS bypass) rather than a dedicated list edge function — writes still go exclusively through admin-create-org"
  - "Split the single-file build into two task commits (org list/create-org, then invite/pending-invites) by building the Task 1 subset first, verifying build, committing, then layering in Task 2 additions — preserves per-task commit granularity for a plan whose two tasks land in one new file"
  - "Server-returned error JSON ({ error }) is extracted from the FunctionsHttpError response context where available (extractServerError helper), falling back to the UI-SPEC copy strings (slug-collision / invite-failure) when parsing fails"

patterns-established:
  - "extractServerError(error, fallback) helper for parsing jsonError-shaped bodies out of supabase.functions.invoke() error responses — reusable by future admin-* or team-* UI callers"

requirements-completed: ["15-03", "15-04", "15-08", "15-02"]

duration: ~20min
completed: 2026-07-14
---

# Phase 15 Plan 09: Platform Admin Panel UI Summary

**Built the `/admin` platform panel (org list, create-org with live slug preview, invite-first-admin dialog, pending-invites list with per-row resend/revoke) — every write routes through the deployed `admin-*` service-role edge functions via `supabase.functions.invoke`, with no direct cross-org table writes from the client.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-14
- **Tasks:** 2/2 (plus a `checkpoint:human-verify` gate left open per the auto-mode instruction — see below)
- **Files modified:** 1 (new file)

## Accomplishments
- `src/pages/admin/AdminPanel.tsx` created: Settings-style page shell, h1 "Platform Admin" at `text-2xl font-semibold` (not `font-bold`, per the phase's 2-weight typography budget)
- Org list (white-card rows: name, plan pill, slug) + create-org form (name + trial/paid toggle + live `baseSlug()` auto-slug preview), wired to `functions.invoke('admin-create-org', ...)`, surfacing the server's exact "already taken" copy on a 409
- Invite-first-admin dialog triggered per org row, wired to `functions.invoke('admin-invite-first-admin', ...)`
- Pending-invites list wired to `functions.invoke('admin-invites-lifecycle', { action: 'list' })`, with Pending (amber) / Accepted (green) / Revoked (gray) status badges
- Per-row 44px icon Resend/Revoke actions with descriptive `aria-label`s (`Resend invite to {email}` / `Revoke invite to {email}`); Revoke opens the verbatim `DeleteDialog` shape from `TemplatesTab.tsx` with the UI-SPEC "Revoke invite?" copy
- Empty states match UI-SPEC copy exactly ("No organizations yet…", "No pending invites…")

## Task Commits

Each task was committed atomically:

1. **Task 1: Org list + create-org form** - `18c8f9a` (feat)
2. **Task 2: Invite-first-admin form + pending-invites lifecycle UI** - `f4fad26` (feat)

**Plan metadata:** (this commit) `docs(15-09): complete Platform Admin panel plan`

## Files Created/Modified
- `src/pages/admin/AdminPanel.tsx` - Platform admin page: org list, create-org form, invite-first-admin dialog, pending-invites list with resend/revoke

## Decisions Made
- Org list read uses a direct `supabase.from('organizations').select()` call (RLS-permitted for `super_admin` via the existing `orgs_super_admin` policy) rather than routing a simple list through an edge function — this is a read, not a write, so it does not violate the "no direct cross-org table writes" constraint (writes/mutations all go through `admin-create-org` / `admin-invite-first-admin` / `admin-invites-lifecycle`).
- Built and committed Task 1's file content first (org list + create-org only, with a placeholder no-op "Invite Admin" button), verified `npm run build` passed, committed, then layered in the Task 2 additions (dialog + pending-invites list + wiring the button's `onClick`) and committed separately — keeps the two task commits atomic and independently buildable even though both land in the same new file.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1-3 auto-fixes were needed; the edge function contracts (plan 08) matched the interfaces documented in this plan's `<context>` block exactly.

## Issues Encountered

None during implementation. Note for the orchestrator: this plan's frontmatter declares `depends_on: [15-08]` (deploy wave), but `15-08-PLAN.md` has no `15-08-SUMMARY.md` yet — the `admin-*` edge functions this UI calls have not been deployed live. The UI code is written strictly against the plan-08 contracts documented in this plan's `<context>` block (verified by re-reading the actual edge function source in `supabase/functions/admin-*`), so it should work once 15-08 deploys, but the live `checkpoint:human-verify` flow cannot be exercised until then.

## User Setup Required

None - no external service configuration required. Route gating (`SuperAdminRoute` + `/admin` route registration in `App.tsx`) is deliberately deferred to plan 15-11 per this plan's `<objective>`; this page is not yet reachable from the app shell.

## Checkpoint Note (Ready for Visual Review)

This plan's frontmatter is `autonomous: false` — the final task is a `checkpoint:human-verify` gate requiring a signed-in super_admin to visually exercise the live create-org / invite / resend / revoke flow through the app UI. Per the orchestrator's instruction for this run, the checkpoint was **not** interactively blocked on; the full UI was built per the UI-SPEC contract and verified via automated build + grep-based acceptance criteria only.

**Still outstanding before this can be manually verified end-to-end:**
- `/admin` is not yet routed (plan 15-11 adds `SuperAdminRoute` + the `App.tsx` route entry) — there is currently no way to reach this page from the running app.
- Live verification (org creation, live slug preview, duplicate-name handling, real invite email delivery, resend/revoke against a live inbox) per the plan's `<how-to-verify>` steps still needs to happen once plan 15-11 wires the route — recommend re-surfacing this checkpoint at that point, or immediately after, before Phase 15 is considered fully done.

## Next Phase Readiness
- `AdminPanel.tsx` is complete and build-clean; ready to be imported and route-gated by plan 15-11.
- All grep-based acceptance criteria from the plan pass (edge-function-only writes, `aria-label`s, dialog copy, status-tier classes, slug preview, empty-state copy, zero `font-bold`).
- Human visual/functional verification of the live create/invite/resend/revoke flow remains open — flagged above for follow-up once the route exists.

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/pages/admin/AdminPanel.tsx
- FOUND: .planning/phases/15-client-onboarding-provisioning/15-09-SUMMARY.md
- FOUND commit: 18c8f9a
- FOUND commit: f4fad26
