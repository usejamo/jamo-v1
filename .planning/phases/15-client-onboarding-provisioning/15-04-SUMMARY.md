---
phase: 15-client-onboarding-provisioning
plan: 04
subsystem: api
tags: [supabase-edge-functions, deno, auth-admin, invites, super-admin, slug]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning (plan 01)
    provides: invites table (email/org_id/role/invited_by/status), handle_new_user trigger reading invites by email, _shared/auth.ts getAuthedUserAndOrg/jsonError
provides:
  - _shared/invites.ts createInvite/revokeInvite (D-01/D-02/D-03 sequence, reused by team-invite in plan 06)
  - admin-create-org edge function (req 3, super_admin-gated org creation with unique slug)
  - admin-invite-first-admin edge function (req 4, super_admin-gated cross-org first-admin invite, role server-fixed)
  - src/lib/slug.ts baseSlug pure fn, unit-tested
affects: [15-06-team-invite, 15-08-deploy-wave, 15-09-admin-panel-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared invite sequence module (_shared/invites.ts) — INSERT-commit-first then auth.admin call then compensate-on-failure, imported by both admin and team edge functions so D-03 ordering lives in one place"
    - "super_admin assertion via user_profiles lookup keyed by JWT userId (never body/panel-implied), same shape across all admin-* edge functions"
    - "slug uniqueness via insert-catch-23505-retry loop bounded to 6 attempts, duplicated (not imported) between src/lib/slug.ts (unit-tested) and the Deno edge function (deploy-time import boundary)"

key-files:
  created:
    - supabase/functions/_shared/invites.ts
    - supabase/functions/admin-create-org/index.ts
    - supabase/functions/admin-create-org/test.ts
    - supabase/functions/admin-invite-first-admin/index.ts
    - supabase/functions/admin-invite-first-admin/test.ts
    - src/lib/slug.ts
    - src/lib/__tests__/slug.test.ts
  modified: []

key-decisions:
  - "baseSlug duplicated between src/lib/slug.ts (unit-tested, client-importable) and admin-create-org/index.ts (Deno edge runtime cannot resolve src/lib/ imports at deploy time) — kept in sync manually per existing repo convention (chunker.ts/ingest-regulatory.ts)"
  - "createInvite/revokeInvite accept an untyped `admin: any` Supabase client param (deno-lint-ignore no-explicit-any) rather than importing SupabaseClient<Database> generics, to keep the shared module free of Deno-specific top-level type imports and loadable by both the edge runtime and future plain test runners"
  - "plan validation restricted to IN ('trial','paid') per this plan's explicit action text, even though the organizations.slug migration comment lists a broader trial/starter/pro/enterprise set — the plan's own acceptance criteria and action instructions are authoritative for this task; broader plan values (if needed) are a future decision, not this plan's scope"

requirements-completed: ["15-03", "15-04"]

# Metrics
duration: 25min
completed: 2026-07-14
---

# Phase 15 Plan 04: Cross-Org Super-Admin Provisioning Backend Summary

**Shared D-01/D-02/D-03 invite helper (_shared/invites.ts) plus two super_admin-gated edge functions — admin-create-org (unique-slug org creation) and admin-invite-first-admin (server-bound org/role first-admin invite) — both asserting super_admin from the verified JWT, never the panel or request body.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-14
- **Completed:** 2026-07-14
- **Tasks:** 3
- **Files modified:** 7 (all new)

## Accomplishments
- `_shared/invites.ts` implements the D-01/D-02/D-03 sequence: INSERT pending invite row (committed first) → `auth.admin.inviteUserByEmail` → compensate (revoke) on failure. Exports `createInvite` and `revokeInvite`, ready for reuse by `team-invite` (plan 06).
- `admin-create-org` creates an organization from `{ name, plan }`, validates `plan IN ('trial','paid')`, and resolves slug uniqueness via a bounded (6-attempt) insert-catch-`23505`-retry loop — never a pre-check-then-insert race.
- `admin-invite-first-admin` invites a first admin for any target org (`targetOrgId` may differ from the caller's own org — the point of the cross-org op), hardcoding `role: 'admin'` server-side; the request body's `role` field, if present, is never even destructured.
- Both admin functions assert `super_admin` from a `user_profiles` lookup keyed by the JWT-verified `userId` (via `getAuthedUserAndOrg`), closing T-15-12 (privilege escalation by merely reaching the panel).
- `src/lib/slug.ts`'s `baseSlug` is unit-tested with 7 Vitest cases (spaces, case, punctuation collapse, hyphen trimming, whitespace, 60-char cap, multi-char collapse).

## Task Commits

Each task was committed atomically:

1. **Task 1: _shared/invites.ts helper (createInvite sequence)** - `3e8a333` (feat)
2. **Task 2: admin-create-org edge function + slug unit test (req 3)** - `a3543cf` (feat)
3. **Task 3: admin-invite-first-admin edge function + Deno test scaffolds (req 4)** - `8d84be5` (feat)

_Note: all three tasks were straightforward `feat` commits; no TDD red/green cycle was specified for this plan (edge functions verified via grep-acceptance + Vitest for the pure slug fn)._

## Files Created/Modified
- `supabase/functions/_shared/invites.ts` - `createInvite` (D-03 insert-then-invite-then-compensate) and `revokeInvite` (mark revoked + optional `deleteUser`)
- `supabase/functions/admin-create-org/index.ts` - super_admin-gated org creation, plan validation, unique-slug retry loop
- `supabase/functions/admin-create-org/test.ts` - Deno test scaffold (3 active pure-predicate assertions + 2 `ignore:true` live-integration placeholders)
- `supabase/functions/admin-invite-first-admin/index.ts` - super_admin-gated first-admin invite, role server-fixed to `'admin'`
- `supabase/functions/admin-invite-first-admin/test.ts` - Deno test scaffold (2 active pure-predicate assertions + 2 `ignore:true` live-integration placeholders)
- `src/lib/slug.ts` - `baseSlug` pure function
- `src/lib/__tests__/slug.test.ts` - 7 Vitest specs for `baseSlug`

## Decisions Made
- `baseSlug` duplicated (not imported) between `src/lib/slug.ts` and `admin-create-org/index.ts` — the Deno edge runtime cannot resolve `src/lib/` imports at deploy time (established convention from Phase 4/14.6: `chunker.ts`/`ingest-regulatory.ts` duplication pattern). Both copies are byte-identical at time of writing; keep in sync manually if the logic changes.
- `createInvite`/`revokeInvite` type their `admin` client param as `any` (with a `deno-lint-ignore` comment) rather than pulling in `SupabaseClient<Database>` generics, matching `_shared/auth.ts`'s stated goal of staying loadable in both the Deno edge runtime and plain test runners without Deno-specific top-level type imports.
- Plan validation is strictly `IN ('trial', 'paid')` per this plan's explicit action text and acceptance criteria, even though the `organizations` table's original migration comment lists a broader `trial/starter/pro/enterprise` set. Followed the plan's own instruction literally rather than reconciling against the older comment — expanding the valid-plan set (if ever needed) is out of this plan's scope.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 auto-fixes were required; the shared helper, both edge functions, and the slug unit test all matched the plan's `<action>` and `<acceptance_criteria>` blocks directly.

## Issues Encountered
- Deno CLI is unavailable in this dev sandbox (`deno --version` → command not found), confirming the plan's stated grep-acceptance contingency (matching the Phase 14.3 precedent) applies here too. All acceptance criteria were verified via `grep` per the plan's `<verify><automated>` blocks; live Deno test execution (and full request/response integration for both edge functions) remains deferred to a future live-verify pass, consistent with every other Phase 15 edge-function plan so far.

## User Setup Required

None - no external service configuration required. Per this plan's `<live_ops_note>`, no edge function deploy was attempted; deployment of all Phase 15 edge functions happens together in plan 08.

## Next Phase Readiness
- `_shared/invites.ts`'s `createInvite`/`revokeInvite` signatures are ready for plan 05 (invite-acceptance flow, already built in 15-03) and plan 06 (`team-invite`, same-org teammate invites) to import directly.
- `admin-create-org` and `admin-invite-first-admin` are code-complete and grep/unit-verified but NOT deployed — plan 08's deploy wave must ship both alongside the rest of Phase 15's edge functions before any live UAT of the super_admin provisioning flow can occur.
- No blockers identified for downstream plans in this phase.

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*

## Self-Check: PASSED

All 7 created files verified present; all 3 task commit hashes (`3e8a333`, `a3543cf`, `8d84be5`) verified present in git log.
