---
phase: 15-client-onboarding-provisioning
plan: 10
subsystem: ui
tags: [react, supabase, edge-functions, rbac, settings]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning (plan 06)
    provides: team-invite / team-manage edge functions (same-org, role-capped invite + role change/deactivate)
  - phase: 15-client-onboarding-provisioning (plan 09)
    provides: AdminPanel.tsx row/badge/dialog patterns mirrored here (Pending Invites list shape)
provides:
  - Settings → Team tab (org-admin self-serve teammate management), gated to admin/super_admin
  - team-manage `list_members` action (org-scoped member list with email, since user_profiles has no email column)
  - team-invite `resend`/`revoke` actions (same-org pending-invite lifecycle)
affects: [15-11 (route gating / final wiring), any future plan touching TeamTab.tsx or team-invite/team-manage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Change Role implemented as a direct toggle (admin<->user) via a single 44px icon action, not a dialog — non-destructive/reversible action per UI-SPEC row shape"
    - "Own-org pending invites read directly via invites_select_own_org RLS (no edge function needed for the list itself); only resend/revoke are privileged edge-function calls"

key-files:
  created:
    - src/components/settings/TeamTab.tsx
  modified:
    - src/pages/Settings.tsx
    - supabase/functions/team-manage/index.ts
    - supabase/functions/team-invite/index.ts
    - supabase/functions/_shared/invites.ts

key-decisions:
  - "Added team-manage `list_members` action (deviation, Rule 3): user_profiles has no email column (auth.users owns it) and no client-readable view exposes it — the plan's own instruction to 'fetch org members via supabase.from(user_profiles)' cannot satisfy the UI-SPEC's 'name/email' row requirement. list_members uses the service-role client (already required for admin ops) to join each org-scoped profile to its auth user's email via admin.auth.admin.getUserById."
  - "Added team-invite `resend`/`revoke` actions (deviation, Rule 3): plan Task 3 requires resend/revoke to go through 'the team-scoped lifecycle path,' but no same-org resend/revoke surface existed on team-invite or team-manage. Mirrored admin-invites-lifecycle's resend(=revoke-then-reissue)/revoke shape, scoped to org_id === callerOrgId instead of super_admin cross-org, with a defense-in-depth super_admin-invite rejection."
  - "Extracted findAuthUserIdByEmail into _shared/invites.ts (exported) so team-invite's resend/revoke can reuse the same paginated auth.users lookup as admin-invites-lifecycle, instead of duplicating it."

patterns-established:
  - "Same-org pending-invites list reads the invites table directly client-side (RLS-scoped), while cross-org privileged mutations (resend/revoke/change_role/deactivate) always go through a team-* edge function — the RLS SELECT vs. service-role WRITE split established in plan 06 extends cleanly to the sub-list."

requirements-completed: [15-06, 15-07, 15-08]

# Metrics
duration: 55min
completed: 2026-07-14
---

# Phase 15 Plan 10: Settings Team Tab Summary

**Org-admin "Team" tab in Settings — invite (role-capped), member list with role toggle/deactivate/reactivate, and an own-org pending-invites sub-list with resend/revoke, all via team-invite/team-manage edge functions**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-14T06:00:00Z
- **Completed:** 2026-07-14T06:57:00Z
- **Tasks:** 3 (+ checkpoint left open per instruction, see below)
- **Files modified:** 5 (1 new, 4 modified)

## Accomplishments
- `Team` sub-tab registered in Settings, gated to `admin`/`super_admin` exactly like `Templates`/`Reference Library`
- Card 1 "Invite a teammate": email + role select (admin/user only — `super_admin` never appears in the UI or is accepted server-side) → `team-invite`
- Card 2 "Team members": org-scoped member list (name/email, role badge, Active/Deactivated status) with Change Role (direct admin↔user toggle) and Deactivate/Reactivate, all via `team-manage`
- Own-org pending-invites sub-list (Pending/Accepted/Revoked badges, Resend/Revoke actions), read directly via RLS and mutated via new `team-invite` resend/revoke actions
- All privileged writes route through the deployed `team-invite`/`team-manage` edge functions; no direct table writes for invite/role/deactivate/resend/revoke

## Task Commits

Each task was committed atomically:

1. **Task 1: Register the gated 'Team' tab in Settings** - `35b5cb0` (feat)
2. **Task 2: TeamTab invite card + member list (role change/deactivate)** - `5893777` (feat)
3. **Task 3: TeamTab own-org pending-invites sub-list (resend/revoke)** - `33ea80e` (feat)

**Plan metadata:** _pending_ (docs: complete plan — this commit)

## Files Created/Modified
- `src/components/settings/TeamTab.tsx` - New: invite card, member list (Change Role/Deactivate/Reactivate), pending-invites sub-list (Resend/Revoke) — modeled on TemplatesTab.tsx's two-card chrome + AdminPanel.tsx's row/badge/dialog shapes
- `src/pages/Settings.tsx` - `'Team'` added to `SUB_TABS` and the `isOrgAdmin` filter; renders `<TeamTab />`
- `supabase/functions/team-manage/index.ts` - Added `list_members` action (org-scoped, service-role join to auth.users email)
- `supabase/functions/team-invite/index.ts` - Added `resend`/`revoke` actions (same-org scoped, super_admin invites rejected)
- `supabase/functions/_shared/invites.ts` - Exported `findAuthUserIdByEmail` (previously private to admin-invites-lifecycle) for reuse by team-invite

## Decisions Made
See `key-decisions` in frontmatter — the two edge-function extensions (list_members, resend/revoke) were both required to satisfy this plan's own stated UI (member email display, own-org resend/revoke) but were not present in the plan-06-built `team-invite`/`team-manage` contracts. Both changes stay within the same-org, role-capped, super_admin-never-targeted invariants established in plan 06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `team-manage` `list_members` action to source member email**
- **Found during:** Task 2
- **Issue:** The plan instructs fetching org members via `supabase.from('user_profiles').select(...)` (RLS-scoped), but `user_profiles` has no `email` column (confirmed against `database.types.ts` and the plan-01 migration — email lives only on `auth.users`, and no view exposes it to the anon/authenticated client). The UI-SPEC's member row explicitly requires "name/email." Without a fix, Card 2 could not render emails at all.
- **Fix:** Added a `list_members` action to `team-manage` that, after the existing caller-admin check, queries `user_profiles` scoped to `callerOrgId` via the service-role client and joins each row to its `auth.users` email via `admin.auth.admin.getUserById`.
- **Files modified:** `supabase/functions/team-manage/index.ts`, `src/components/settings/TeamTab.tsx`
- **Verification:** Build passes; `fetchMembers()` calls `functions.invoke('team-manage', { body: { action: 'list_members' } })` and renders `member.email`.
- **Committed in:** `5893777` (Task 2 commit)

**2. [Rule 3 - Blocking] Added `resend`/`revoke` actions to `team-invite` for the own-org pending-invites sub-list**
- **Found during:** Task 3
- **Issue:** Task 3 requires Resend/Revoke actions on the own-org pending-invites sub-list to go "through the team-scoped lifecycle path," but no same-org resend/revoke endpoint existed — only the cross-org, super_admin-only `admin-invites-lifecycle` had this logic.
- **Fix:** Added `action: 'resend' | 'revoke'` handling to `team-invite`, mirroring `admin-invites-lifecycle`'s revoke-then-reissue resend pattern (Pitfall 4) but scoped to `existingInvite.org_id === callerOrgId` with a defense-in-depth rejection of `role === 'super_admin'` invites. Extracted the shared `findAuthUserIdByEmail` pagination helper into `_shared/invites.ts` (exported) rather than duplicating it, so both `admin-invites-lifecycle` and `team-invite` use the same bounded lookup.
- **Files modified:** `supabase/functions/team-invite/index.ts`, `supabase/functions/_shared/invites.ts`, `src/components/settings/TeamTab.tsx`
- **Verification:** Build passes; grep confirms `functions.invoke('team-invite'` used for both `resend` and `revoke` actions; org-mismatch and super_admin-invite guards mirror the plan-06 threat model shape.
- **Committed in:** `33ea80e` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking, both edge-function surface extensions required to satisfy this plan's own UI requirements)
**Impact on plan:** Both extensions stay inside the existing same-org/role-capped/super_admin-never-targeted invariants from plan 06 — no new trust boundary was introduced, only two new actions on already-org-admin-gated, already-org-scoped endpoints. See Threat Flags below.

## Issues Encountered
- **Plan 15-08 (deploy wave) has not yet run** (`15-08-SUMMARY.md` does not exist, despite this plan declaring `depends_on: [15-08]`). This plan's edge-function changes (`list_members`, `resend`, `revoke`) will deploy together with the rest of Phase 15's functions whenever 15-08 runs — no separate deploy action was taken here, consistent with MEMORY `edge-functions-need-deploy` (this executor commits but does not deploy). The Team tab's live functionality (invite/role/deactivate/resend/revoke) cannot be verified end-to-end until 15-08 deploys all five `admin-*`/`team-*` functions.

## User Setup Required

None - no external service configuration required. The Team tab's edge-function calls will work once plan 15-08 deploys `team-invite` and `team-manage` to the live project; no new env vars or secrets are introduced by this plan.

## Next Phase Readiness

- **Checkpoint left open (per orchestrator instruction):** This plan's `type="checkpoint:human-verify"` gate (sign-in as org admin, invite/accept/role-change/deactivate/reactivate end-to-end, cross-org scoping check) was NOT executed — the user chose to keep building without pausing for interactive UI review. The Team tab is built, builds clean, and is ready for visual/functional review whenever plan 15-08 (deploy) has run and a live org-admin session is available.
- `src/components/settings/TeamTab.tsx` is code-complete and wired into Settings, gated to `admin`/`super_admin`.
- `team-manage` and `team-invite` now additionally expose `list_members` and `resend`/`revoke` — these will deploy alongside the rest of Phase 15's functions in plan 15-08.
- Blocked on 15-08 for any live verification (deploy wave has not run as of this plan's completion).

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: new-action-surface | `supabase/functions/team-manage/index.ts` | New `list_members` action returns org members' emails (from `auth.users` via service-role) to any caller who passes the existing admin/super_admin role gate. Same trust boundary as existing actions (org-admin-only, org-scoped query on `callerOrgId`), but it is a net-new read path not enumerated in the plan's original threat register (T-15-33/34/35 cover invite/manage, not list). No cross-org leak: query is filtered to `callerOrgId` before any auth.users lookup. |
| threat_flag: new-action-surface | `supabase/functions/team-invite/index.ts` | New `resend`/`revoke` actions on the same-org `team-invite` function (previously invite-creation-only). Mirrors `admin-invites-lifecycle`'s cross-org resend/revoke logic but re-scoped to `org_id === callerOrgId`, with an added `role === 'super_admin'` invite rejection not present in the plan's original team-invite threat coverage. |

## Self-Check: PASSED

- FOUND: src/components/settings/TeamTab.tsx
- FOUND: TeamTab wired in src/pages/Settings.tsx
- FOUND: commit 35b5cb0
- FOUND: commit 5893777
- FOUND: commit 33ea80e

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*
