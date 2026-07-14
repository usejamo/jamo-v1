---
phase: 15-client-onboarding-provisioning
plan: 05
subsystem: auth
tags: [supabase, edge-function, deno, invites, super_admin, gotrue]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning (plan 01)
    provides: invites table (id, email, org_id, role, status, invited_by), no super_admin RLS bypass on invites
  - phase: 15-client-onboarding-provisioning (plan 04)
    provides: _shared/invites.ts (createInvite/revokeInvite), _shared/auth.ts (getAuthedUserAndOrg), super_admin-from-JWT assertion pattern (admin-create-org)
provides:
  - admin-invites-lifecycle edge function — list (cross-org, joined to org name), resend (revoke-then-reissue), revoke (delete auth user + flag row)
affects: [15-08 (deploy wave), pending-invites admin panel UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auth-user-by-email pagination helper (findAuthUserIdByEmail) — GoTrue admin listUsers has no email filter param in supabase-js v2; paginate (200/page, capped at 25 pages) and match client-side."
    - "Resend = revoke-then-reissue: never a second inviteUserByEmail call on a still-pending email (Pitfall 4) — reuses _shared/invites.ts revokeInvite + createInvite so the D-03/D-06 sequencing lives in one place."

key-files:
  created:
    - supabase/functions/admin-invites-lifecycle/index.ts
    - supabase/functions/admin-invites-lifecycle/test.ts
  modified: []

key-decisions:
  - "findAuthUserIdByEmail resolves an existing auth user for an invite's email by paginating admin.auth.admin.listUsers (200/page, capped at 25 pages / 5,000 users) since supabase-js v2's GoTrue admin API has no email-filter query param — a still-pending invite legitimately has no matching auth user (returns undefined), which revokeInvite already handles as optional."
  - "Comments describing the resend/revoke design deliberately avoid the literal string 'inviteUserByEmail' (using 'invite-email admin call' instead) so the plan's automated verify grep (grep -c \"inviteUserByEmail\" returns 0) isn't tripped by documentation text — the real single call site remains inside _shared/invites.ts's createInvite, imported not reimplemented."

requirements-completed: [15-08]

# Metrics
duration: 20min
completed: 2026-07-14
---

# Phase 15 Plan 05: Invite Lifecycle (list/resend/revoke) Summary

**admin-invites-lifecycle edge function: cross-org pending-invites list, safe resend via revoke-then-reissue, and revoke via auth-user deletion + status flag — all gated by a JWT-verified super_admin check.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-14T01:24:00Z
- **Completed:** 2026-07-14T01:44:27Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- One edge function handling three actions (`list`, `resend`, `revoke`) for the platform-admin pending-invites panel, all cross-org via the service-role client
- Resend correctly sidesteps GoTrue's ambiguous re-invite-on-unconfirmed-user behavior (RESEARCH Pitfall 4) by always revoking the stale row/auth-user first, then minting a genuinely fresh invite through the existing `createInvite` helper
- Revoke closes the "stale/revoked link still works" threat (T-15-18/D-06) by deleting the underlying `auth.users` row (kills the link's token) in addition to flagging the invites row
- Deno test scaffold documents the 403/sequence/400 predicates and flags live email delivery as manual-only, matching the established Deno-unavailable contingency from plans 01/02/04

## Task Commits

1. **Task 1: admin-invites-lifecycle (list / resend / revoke)** - `c5acbf2` (feat)
2. **Task 2: Deno test scaffold for admin-invites-lifecycle** - `1735dbb` (test)

**Plan metadata:** _(pending — see final commit below)_

## Files Created/Modified
- `supabase/functions/admin-invites-lifecycle/index.ts` - super_admin-gated list/resend/revoke edge function; `findAuthUserIdByEmail` pagination helper; reuses `_shared/invites.ts`'s `createInvite`/`revokeInvite`
- `supabase/functions/admin-invites-lifecycle/test.ts` - Deno test scaffold (403 predicate, revoke-then-reissue sequence assertion, unknown-action 400 predicate, `ignore:true` live-integration cases)

## Decisions Made
- **Auth-user-by-email resolution:** implemented `findAuthUserIdByEmail` as a bounded pagination loop over `admin.auth.admin.listUsers` (no email-filter param exists on the GoTrue admin API in supabase-js v2). Capped at 25 pages × 200 = 5,000 users; a lookup at that scale needing more would require a dedicated index/RPC, not this function. A still-pending invite legitimately yields `undefined` (no auth user exists yet) — `revokeInvite`'s optional `authUserId` param already handles this.
- **Comment wording avoids the literal `inviteUserByEmail` string** in `index.ts` (uses "invite-email admin call" instead) so the plan's own automated acceptance grep (`grep -c "inviteUserByEmail"` must return 0) isn't broken by documentation prose describing the design intent — the actual call remains solely inside `_shared/invites.ts`.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance-criteria greps (super_admin gate, revoke-then-reissue resend block containing both `revokeInvite` and `createInvite`, `organizations(name)` cross-org join, zero direct `inviteUserByEmail` calls, Deno test scaffold with manual-only live-resend note) were verified directly and pass.

## Issues Encountered

Initial draft included the literal string `inviteUserByEmail` in two explanatory comments (describing why resend avoids calling it a second time), which caused the plan's `grep -c "inviteUserByEmail" index.ts` acceptance check to return 2 instead of the required 0. Reworded both comments to say "invite-email admin call" instead — no logic change, purely a documentation wording fix caught before commit.

## User Setup Required

None - no external service configuration required. This function is not deployed by this plan (deploy is orchestrated together in wave 15-08 per the live-ops boundary).

## Next Phase Readiness
- `admin-invites-lifecycle` is code-complete and committed; ready to be deployed alongside the rest of Phase 15's edge functions in plan 15-08
- The pending-invites admin panel UI (consumer of this function's `list`/`resend`/`revoke` actions) can be built against this contract in a later plan
- Live verification of actual resend email delivery and the revoke-then-reissue DB-state sequence remains a manual/human-verify item per 15-VALIDATION.md (req 15-08 row) — to be exercised after the plan 15-08 deploy

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: supabase/functions/admin-invites-lifecycle/index.ts
- FOUND: supabase/functions/admin-invites-lifecycle/test.ts
- FOUND: commit c5acbf2
- FOUND: commit 1735dbb
