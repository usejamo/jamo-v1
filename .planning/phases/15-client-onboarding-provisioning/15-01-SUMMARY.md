---
phase: 15-client-onboarding-provisioning
plan: 01
subsystem: database
tags: [postgres, rls, supabase, auth-trigger, migrations]

# Dependency graph
requires:
  - phase: 14.3-edge-identity-hardening
    provides: getAuthedUserAndOrg / isInternalServiceRoleCall JWT-derivation pattern (referenced by later Phase 15 plans, not consumed directly by this DB-only plan)
provides:
  - "invites table (single source of truth for org/role assignment, D-01)"
  - "RLS on invites: same-org SELECT/INSERT only, no super_admin bypass (D-08)"
  - "user_profiles.is_active boolean column (req 7)"
  - "profiles_admin_update_same_org RLS UPDATE policy (org-admin member management)"
  - "hardened handle_new_user() trigger body reading org/role from invites only (closes req-12 tamper vector)"
  - "req-12 tamper-proofing manual verification checklist"
affects: [15-02, 15-03, 15-04, 15-05, 15-06, 15-07, 15-08, 15-09, 15-10, 15-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-bound identity trigger: handle_new_user resolves org_id/role exclusively from a server-controlled table (invites), never from client-supplied raw_user_meta_data"
    - "No-fallback invariant guard: RAISE EXCEPTION on missing pending invite rolls back the auth.users insert entirely (D-05) rather than defaulting to a permissive branch"

key-files:
  created:
    - supabase/migrations/20260713000002_invites_and_trigger_hardening.sql
    - supabase/migrations/verify/15-12-tamper.sql
  modified: []

key-decisions:
  - "invites table has no 'expired' status — expiry is computed from the Supabase invite-link TTL at read time, not stored as a row state (per 15-RESEARCH.md Open Question 1)"
  - "No super_admin bypass policy added to invites or user_profiles — D-08 confines the only cross-org RLS bypass to organizations (orgs_super_admin); cross-org admin operations route through service-role edge functions in later plans"
  - "Live migration apply intentionally NOT performed by this executor — deferred to the orchestrator per explicit run-time override (this project's Supabase migration history has diverged and supabase db push fails here; apply must go through the Supabase MCP apply_migration tool)"

patterns-established:
  - "Pattern 3 (invites-bound identity trigger): SELECT org_id, role FROM invites WHERE lower(email)=lower(NEW.email) AND status='pending' ORDER BY created_at DESC LIMIT 1, then RAISE EXCEPTION if null — the single canonical shape all future auth-trigger-adjacent work in this phase must match"

requirements-completed: ["15-12", "15-07", "15-06", "15-08"]

# Metrics
duration: 25min
completed: 2026-07-14
---

# Phase 15 Plan 01: Invites Table + Trigger Hardening Summary

**Dedicated `invites` table plus a rewritten `handle_new_user` trigger that binds org/role exclusively from that server-controlled row, closing the client-metadata tamper vector; `user_profiles.is_active` and a same-org admin UPDATE policy land alongside it.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-14T01:13:15Z
- **Tasks:** 3/3 completed (Task 2's live-apply sub-step deferred to orchestrator per override — see below)
- **Files modified:** 2 created

## Accomplishments
- `invites` table (email, org_id, role CHECK'd to super_admin/admin/user, invited_by, status pending/accepted/revoked, timestamps) with two supporting indexes and RLS (same-org SELECT, same-org admin/super_admin INSERT)
- `user_profiles.is_active BOOLEAN NOT NULL DEFAULT TRUE` added
- `profiles_admin_update_same_org` RLS UPDATE policy: org admins can update profiles within their own org only (USING + WITH CHECK both pin org_id)
- `handle_new_user()` body rewritten to look up org/role by email in `invites` (status='pending', most recent first) and RAISE EXCEPTION when no match exists — the trigger definition on `auth.users` itself is untouched
- req-12 tamper-proofing manual verification checklist authored (`supabase/migrations/verify/15-12-tamper.sql`) covering both the tampered-metadata-ignored assertion and the no-invite-RAISEs assertion

## Task Commits

Each task was committed atomically:

1. **Task 1: Write invites table, is_active column, RLS policies, and rewritten trigger** - `cb83d5b` (feat)
2. **Task 2: [BLOCKING] Apply the migration to the live hosted project** - deferred to orchestrator, no new commit (see "Deferred to orchestrator" below)
3. **Task 3: Author the req-12 tamper-proofing verification script** - `20afd87` (docs)

_No plan-metadata commit hash yet — created after this SUMMARY is written per the final_commit step._

## Files Created/Modified
- `supabase/migrations/20260713000002_invites_and_trigger_hardening.sql` - invites table + RLS + is_active column + profiles_admin_update_same_org policy + hardened handle_new_user()
- `supabase/migrations/verify/15-12-tamper.sql` - manual-only live-DB tamper/no-invite verification checklist for req 12

## Decisions Made
- No 'expired' invite status stored — expiry is derived from the Supabase invite link TTL, not a DB column (matches 15-RESEARCH.md Open Question 1 resolution already locked before this plan ran)
- No super_admin RLS bypass added anywhere in this migration — verified via grep that every `super_admin` occurrence in the file is either inside the `role` CHECK constraint or an `IN ('admin','super_admin')` role-check on the two new same-org policies, never a `FOR ALL ... USING (role = 'super_admin')` shape (D-08 compliance)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for Tasks 1 and 3.

### Deferred to orchestrator (NOT a deviation — explicit run-time override)

**Task 2 (live migration apply)** was intentionally NOT executed by this executor. Per an explicit override delivered at spawn time: this project's Supabase migration history has diverged and `supabase db push` fails here (see MEMORY: `supabase-migration-history-diverged`); attempting any live-apply command (`db push`, `migration up`, or a direct DB connection) was disallowed for this agent. The migration SQL file was written exactly per plan, committed (`cb83d5b`), and is syntactically sound by inspection (balanced `$$` function body delimiters, matched statement terminators, all 7 required statement groups present and grep-verified — see Acceptance Criteria below). The live apply itself — via the Supabase MCP `apply_migration` tool against project ref `fuuvdcvbliijffogjnwg`, migration name `invites_and_trigger_hardening` — is left to the orchestrator to perform, along with the post-apply confirmation queries (`to_regclass('public.invites')`, `information_schema.columns` check for `user_profiles.is_active`, and a `pg_proc`/`execute_sql` check that the live `handle_new_user` body contains `FROM invites`).

**Downstream impact:** Task 2 is marked `[BLOCKING]` in the plan — no other Phase 15 plan should execute against the live database until the orchestrator confirms the apply succeeded. This SUMMARY's `requirements-completed` reflects the code-side closure of reqs 15-12/07/06/08; live enforcement of those requirements is not yet in effect until the migration is applied.

---

**Total deviations:** 0 auto-fixed. 1 explicit deferral (live apply, per run-time override — not a Rule 1-4 deviation).
**Impact on plan:** No scope creep. The only variance from the plan's literal text is WHO performs the live-apply step, not WHAT is applied.

## Issues Encountered
None.

## Acceptance Criteria Verification (Task 1)

All grep-based acceptance criteria from the plan passed:
- `CREATE TABLE invites` count = 1
- `FROM invites` present in the trigger SELECT with `status = 'pending'`
- `RAISE EXCEPTION 'no pending invite for %'` present
- `D-05` comment present beside the RAISE
- `ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE` present
- `profiles_admin_update_same_org` policy present
- All 6 `super_admin` occurrences are inside the role CHECK constraint or an `IN ('admin','super_admin')` clause — zero `FOR ALL ... super_admin` bypass policies on invites/user_profiles
- Zero occurrences of `raw_user_meta_data->>'org_id'` or `raw_user_meta_data->>'role'` (tamper vector fully removed)

## Acceptance Criteria Verification (Task 3)
- `supabase/migrations/verify/15-12-tamper.sql` exists
- `grep -rn "no pending invite" supabase/migrations/` finds the RAISE reference in the migration file, cross-referenced from the verify checklist

## User Setup Required

None from this plan directly. **Live migration apply is required before any downstream plan runs** — see "Deferred to orchestrator" above. The orchestrator (or a human with Supabase MCP access) must run `apply_migration` against `fuuvdcvbliijffogjnwg` with this file's SQL body before Plan 02+ can be safely executed or manually verified end-to-end.

## Next Phase Readiness
- Migration file is committed and ready for the orchestrator to apply live via Supabase MCP `apply_migration`
- Once applied, all downstream Phase 15 plans (edge functions, bootstrap script, admin/team UI) can rely on: `invites` table, `user_profiles.is_active`, `profiles_admin_update_same_org`, and the invites-bound `handle_new_user` trigger
- req-12 tamper-proofing checklist is ready to run against the live DB once the migration is applied and at least one downstream plan produces a way to call `auth.admin.createUser` with a hostile payload (this plan only authors the checklist, per Task 3's manual-only scope)
- **Blocker for Plan 02+:** live apply confirmation (Task 2) must complete before any plan that exercises the invite-signup path can be verified end-to-end

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260713000002_invites_and_trigger_hardening.sql
- FOUND: supabase/migrations/verify/15-12-tamper.sql
- FOUND: .planning/phases/15-client-onboarding-provisioning/15-01-SUMMARY.md
- FOUND: commit cb83d5b
- FOUND: commit 20afd87
