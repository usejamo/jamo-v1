---
phase: 15-client-onboarding-provisioning
plan: 07
subsystem: auth
tags: [supabase, auth-admin-api, invites, bootstrap, tsx, vitest]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning (15-01)
    provides: invites table + handle_new_user trigger reading pending invites (org_id/role binding, no raw_user_meta_data branch)
provides:
  - Idempotent Node/tsx script that provisions the first platform super_admin via the standard invite-first flow
  - npm script entry (`bootstrap:super-admin`) to run it
affects: [15-08 (live bootstrap run against hosted project)]

# Tech tracking
tech-stack:
  added: []
  patterns: [invite-first provisioning reused for the bootstrap operator path, idempotent Node/tsx script shape (loadEnv + isMain guard) shared with scripts/seed-regulatory.ts]

key-files:
  created: [scripts/bootstrap-super-admin.ts, scripts/bootstrap-super-admin.test.ts]
  modified: [package.json]

key-decisions:
  - "Extracted bootstrapSuperAdmin(admin, email, password) as a client-injectable, exported function so the test suite can mock the Supabase client and assert exact call ordering without a real project or a real .env file."
  - "Idempotency guard checks user_profiles.role = 'super_admin' (not invites), matching the PATTERNS.md/RESEARCH.md spec verbatim — re-running is a safe no-op."
  - "Invite inserted status:'pending' BEFORE createUser, flipped to 'accepted' only AFTER createUser succeeds — no special trigger branch, same ordering as every other provisioning path (D-12 Approach A)."

patterns-established:
  - "Idempotent Node/tsx operator script: loadEnv() reads .env with process.env taking precedence, isMain guard via fileURLToPath comparison, main() throws/exits non-zero on missing env instead of silently proceeding."

requirements-completed: [15-11]

# Metrics
duration: 12min
completed: 2026-07-14
---

# Phase 15 Plan 07: Bootstrap Super Admin Script Summary

**Idempotent Node/tsx script (`scripts/bootstrap-super-admin.ts`) that provisions the first platform super_admin through the exact same invite-first flow as every other provisioning path — upsert internal org, insert pending invite, `auth.admin.createUser`, flip invite to accepted — skipping entirely if a super_admin already exists.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-14T01:27:00Z
- **Completed:** 2026-07-14T01:39:03Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `scripts/bootstrap-super-admin.ts`: idempotent, env-sourced bootstrap script solving the chicken-and-egg `/admin`-unreachable problem, using the invite-first flow (no special trigger branch).
- `scripts/bootstrap-super-admin.test.ts`: unit-verifies both the skip-when-exists path (createUser never called) and the full sequence ordering (upsert → insert pending → createUser → update accepted).
- `package.json`: added `bootstrap:super-admin` npm script entry mirroring the existing `seed:regulatory` entry style.

## Task Commits

1. **Task 1: bootstrap-super-admin.ts (idempotent, env-sourced)** - `78a36d3` (feat)
2. **Task 2: Idempotency test + npm script** - `72defe7` (test)

_No separate plan-metadata commit yet — see final commit below._

## Files Created/Modified
- `scripts/bootstrap-super-admin.ts` - Idempotent bootstrap: idempotency guard, org upsert, pending invite insert, `auth.admin.createUser`, invite flip to accepted; exports `bootstrapSuperAdmin()` and `main()` for testability.
- `scripts/bootstrap-super-admin.test.ts` - Mocked-client tests asserting skip-when-exists and full call-order sequencing.
- `package.json` - Added `"bootstrap:super-admin": "npx tsx scripts/bootstrap-super-admin.ts"`.

## Decisions Made
- Refactored the sequence into an exported `bootstrapSuperAdmin(admin, email, password)` function (rather than only inlining it in `main()`) purely to make the idempotency/ordering testable with a mocked Supabase client, matching the plan's `15-11` acceptance criteria and the `seed-regulatory.ts` convention of exporting `main`/core logic for tests.
- Env-var validation in `main()` throws a clear error (not just proceeding with `undefined`) if `BOOTSTRAP_SUPER_ADMIN_EMAIL`/`PASSWORD` or Supabase URL/service-role key are missing — this is a Rule 2 (missing critical functionality) addition beyond the plan's literal code example, which didn't show the missing-env guard explicitly but the plan's own acceptance criteria (`throw a clear error if missing — never hardcode`) required it.

## Deviations from Plan

None - plan executed exactly as written (the env-guard clarity above was already called for explicitly in the plan's Task 1 `<action>` text, not an unplanned addition).

## Issues Encountered
None.

## User Setup Required

None for this plan. The live run (`npm run bootstrap:super-admin` against the hosted Supabase project, requiring `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `BOOTSTRAP_SUPER_ADMIN_PASSWORD` in `.env`) is explicitly deferred to plan 15-08 per this plan's `<output>` note and the orchestrator's live-ops boundary — this script was NOT run against the live/hosted project in this plan.

## Next Phase Readiness
- Script + test + npm entry are committed and unit-verified (`npm run test:run -- bootstrap-super-admin` green, 2/2 passing).
- Plan 15-08 can now run `npm run bootstrap:super-admin` live to create the first super_admin and verify `/admin` is reachable; re-running afterward must be confirmed as a safe no-op.

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created files and both task commits (`78a36d3`, `72defe7`) verified present.
