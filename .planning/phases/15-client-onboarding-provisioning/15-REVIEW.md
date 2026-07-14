---
phase: 15-client-onboarding-provisioning
reviewed: 2026-07-14T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - supabase/migrations/20260713000002_invites_and_trigger_hardening.sql
  - supabase/functions/_shared/invites.ts
  - supabase/functions/_shared/auth.ts
  - supabase/functions/admin-create-org/index.ts
  - supabase/functions/admin-invite-first-admin/index.ts
  - supabase/functions/admin-invites-lifecycle/index.ts
  - supabase/functions/team-invite/index.ts
  - supabase/functions/team-manage/index.ts
  - supabase/config.toml
  - src/lib/slug.ts
  - scripts/bootstrap-super-admin.ts
  - src/pages/AcceptInvite.tsx
  - src/pages/ForgotPassword.tsx
  - src/pages/ResetPassword.tsx
  - src/pages/admin/AdminPanel.tsx
  - src/components/settings/TeamTab.tsx
  - src/components/SuperAdminRoute.tsx
  - src/context/AuthContext.tsx
  - src/pages/Login.tsx
  - src/App.tsx
  - src/pages/Settings.tsx
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-07-14
**Depth:** standard
**Files Reviewed:** 19 (config.toml counted separately; 20 paths listed)
**Status:** issues_found

## Summary

The edge-function tier is well built: every `admin-*`/`team-*` function derives caller
identity from the verified JWT via `getAuthedUserAndOrg`, asserts role from the
`user_profiles` row (never the body), hardcodes `role='admin'` server-side in
`admin-invite-first-admin`, and caps `team-invite`/`team-manage` to `admin`/`user`
in the caller's own org. The auth pages are correctly route-identified (Pitfalls 1/2),
forgot-password does not enumerate users, `SuperAdminRoute` is correct, and Login/
AuthContext carry no dead signup path or hardcoded org UUIDs. The bootstrap script is
env-sourced only.

However, the migration undermines all of that at the RLS layer. Two new client-facing
policies on `user_profiles` and `invites` fail to constrain the `role` column. The
`user_profiles` UPDATE policy is **directly exploitable**: an org admin can promote
their own profile to `super_admin` via a plain PostgREST call, bypassing every
edge-function role cap and breaking cross-tenant isolation. This is the central concern
of the phase and must be fixed before ship.

## Critical Issues

### CR-01: Org admin can self-escalate to super_admin via user_profiles RLS UPDATE policy

**File:** `supabase/migrations/20260713000002_invites_and_trigger_hardening.sql:48-54`
**Issue:** The new `profiles_admin_update_same_org` policy lets any `admin`/`super_admin`
UPDATE any `user_profiles` row in their own org, and the `WITH CHECK` only validates
that `org_id` is unchanged — it does **not** constrain the `role` column. `user_profiles`
is exposed through PostgREST, so an org admin can escalate directly, bypassing the
careful `admin`/`user` caps enforced in `team-manage`:

```js
// Runs as the org admin's own authed client — passes USING (own org + admin role)
// and WITH CHECK (org_id unchanged). role is unrestricted.
await supabase.from('user_profiles')
  .update({ role: 'super_admin' })
  .eq('user_id', myOwnUserId)
```

Because `private.get_user_role()` reads this same row, the escalation takes effect
immediately, granting the `orgs_super_admin` cross-org bypass and access to every
`admin-*` edge function — a full tenant-isolation break. This directly violates the
phase invariant "org admins must never be able to mint super_admin."

**Fix:** Constrain the role in `WITH CHECK`, or (preferred) drop the direct-update
policy entirely and force all role/activation changes through the service-role
`team-manage` function, which already caps role and blocks super_admin targets:

```sql
-- Option A: cap the assignable role in the policy
CREATE POLICY "profiles_admin_update_same_org" ON user_profiles
  FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  )
  WITH CHECK (
    org_id = (SELECT private.get_user_org_id())
    AND role IN ('admin', 'user')   -- <-- add: never allow super_admin via client
  );
-- Option B (safer): remove this policy; team-manage (service role) owns all writes.
```
Note: verify the pre-existing self-update policy (referenced in the migration comment,
line 9) likewise constrains `role`, or a plain user can self-escalate the same way.

## Warnings

### WR-01: invites INSERT RLS policy does not cap the role column (super_admin invite mintable)

**File:** `supabase/migrations/20260713000002_invites_and_trigger_hardening.sql:37-42`
**Issue:** `invites_insert_own_org` lets an org admin INSERT an invite row into their own
org with **any** role, including `super_admin` — the `WITH CHECK` validates `org_id` and
caller role but not the inserted `role`. `handle_new_user` reads role from a pending
invite, so this is a latent privilege-escalation seed. It is harder to weaponize than
CR-01 (signups are disabled and auth-user creation needs the service role, and the
trigger picks the most-recent pending invite via `ORDER BY created_at DESC`), but it
contradicts the "single source of truth" intent of the invites table and the
no-super_admin-mint invariant. All legitimate inserts already go through service-role
edge functions, so this client policy appears unnecessary.
**Fix:** Add `AND role IN ('admin', 'user')` to the `WITH CHECK`, or drop the client
INSERT policy entirely and let the edge functions (service role) own all invite writes.

### WR-02: Invites are never transitioned pending -> accepted in the normal flow

**File:** `supabase/functions/_shared/invites.ts:61-71`, `src/pages/AcceptInvite.tsx:44-52`
**Issue:** `createInvite` leaves the row `status='pending'` and nothing flips it to
`accepted` when the invitee actually sets their password (`AcceptInvite` only calls
`updateUser({ password })`). Only `bootstrap-super-admin.ts` flips the status. As a
result the AdminPanel "Pending Invites" list and TeamTab's `.neq('status','accepted')`
sub-list show already-onboarded users as pending forever, and a still-`pending` row
remains eligible for the `handle_new_user` trigger, weakening the D-05 one-invite
invariant. Functional/lifecycle bug with a secondary security smell.
**Fix:** Mark the invite `accepted` when the password is first set — e.g. an
`accept-invite` edge function (or an `updated_at`/status write keyed by the verified
JWT email) invoked from `AcceptInvite.handleSubmit` after `updateUser` succeeds.

### WR-03: No last-admin / self-lockout guard in team-manage

**File:** `supabase/functions/team-manage/index.ts:98-135`, `src/components/settings/TeamTab.tsx:293-306`
**Issue:** An org admin can `change_role` themselves down to `user` or `deactivate`
themselves / the only remaining admin, leaving the org with no one able to manage the
team. TeamTab wires the role toggle and deactivate buttons to every member including
self (`isSelf` is computed but only used for a "(You)" label, not to gate actions).
Availability risk, not a breach.
**Fix:** Reject the action server-side when `targetUserId === userId` for
demotion/deactivation, or when it would remove the org's last active admin; hide/disable
the corresponding controls for self in TeamTab.

### WR-04: is_active mirror writes are not error-checked in team-manage

**File:** `supabase/functions/team-manage/index.ts:124,135`
**Issue:** After the authoritative `ban_duration` update, the `user_profiles.is_active`
mirror write is `await`ed but its `error` is discarded. If it fails, the auth-layer ban
still applies (correct) but the UI mirror drifts, showing a banned user as Active (or
vice-versa) with no signal.
**Fix:** Capture and surface the error, e.g. `const { error } = await admin.from(...)...;
if (error) return jsonError(500, error.message, corsHeaders)`, or log it explicitly.

## Info

### IN-01: findAuthUserIdByEmail duplicated instead of imported

**File:** `supabase/functions/admin-invites-lifecycle/index.ts:38-55`
**Issue:** An identical `findAuthUserIdByEmail` is inlined here even though the same
function is exported from `_shared/invites.ts` and imported by `team-invite`. Drift risk.
**Fix:** Import it from `../_shared/invites.ts` and delete the local copy.

### IN-02: baseSlug logic duplicated across src and edge runtime

**File:** `src/lib/slug.ts:6-14`, `supabase/functions/admin-create-org/index.ts:16-23`
**Issue:** Documented, deliberate duplication (Deno cannot resolve `src/lib` at deploy).
Acceptable but a manual-sync hazard.
**Fix:** No action required; keep the two copies in sync if the logic changes.

### IN-03: Organization name stored untrimmed

**File:** `supabase/functions/admin-create-org/index.ts:55-77`
**Issue:** Validation checks `name.trim()` but the insert stores the raw `name`, so
leading/trailing whitespace persists in `organizations.name` (the slug is derived from a
trimmed/normalized value, so only the display name is affected).
**Fix:** Insert `name.trim()`.

### IN-04: Loose `any` types in AuthContext signIn/signOut

**File:** `src/context/AuthContext.tsx:14-15`
**Issue:** `signIn`/`signOut` return `{ data: any; error: any }`, discarding Supabase's
typed results at the context boundary.
**Fix:** Use `AuthResponse` / `{ error: AuthError | null }` from `@supabase/supabase-js`.

### IN-05: minimum_password_length = 6

**File:** `supabase/config.toml:183`
**Issue:** 6 is the Supabase minimum; for an invite-only clinical-research product, 8+
with `password_requirements` is a reasonable hardening.
**Fix:** Consider `minimum_password_length = 8` and a `password_requirements` value.

---

_Reviewed: 2026-07-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
