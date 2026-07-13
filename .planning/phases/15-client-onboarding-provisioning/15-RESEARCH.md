# Phase 15: Client Onboarding & Provisioning - Research

**Researched:** 2026-07-13
**Domain:** Supabase Auth Admin API (invites), Postgres triggers/RLS, custom SMTP (Resend), edge-function service-role patterns
**Confidence:** MEDIUM-HIGH (core trigger/RLS mechanics HIGH — verified against live migrations and Supabase semantics; a few GoTrue behavioral edge cases are MEDIUM/LOW and flagged below with a concrete mitigation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Invite Mechanism & Lifecycle**
- D-01 — Dedicated `invites` table as single source of truth. A small `invites` table (email, org_id, role, invited_by, status enum, timestamps) is the authoritative record for lifecycle (pending/resend/revoke), audit, and server-bound org/role binding. RLS-scoped visibility, role-capped creation (org admins cannot mint super_admin/admin beyond their cap), and acceptance reads the org/role binding solely from this record. `auth.admin` + SMTP still sends the email and creates the `auth.users` row. One migration serves three locked requirements (invite lifecycle, org-admin invites, identity integrity) at once.
- D-02 — Identity binding = trigger-reads-invites (the chosen "third shape"). Keep `handle_new_user` (SECURITY DEFINER, `AFTER INSERT ON auth.users`, runs in the auth-insert's transaction = atomic) but rewrite it to `SELECT org_id, role FROM invites WHERE lower(email)=lower(NEW.email) AND status='pending'` and insert `user_profiles` from that. No `app_metadata` mirror. Rejected: app_metadata (inviteUserByEmail doesn't set it; post-hoc updateUserById lands after the AFTER-INSERT trigger → drift-prone) and edge-function-creates-profile (decouples from the atomic auth insert → half-provisioned-user window).
- D-03 — Trigger fires at invite-SEND time, so ordering is fixed. The `auth.users` row is inserted when the invite is sent (`auth.admin`), not at acceptance. The provisioning edge function MUST: (1) INSERT the `invites` row (committed) → (2) call `auth.admin` to create the user + send email → trigger fires, finds the committed row, binds atomically. `user_profiles` exists pre-acceptance (harmless — login blocked until `confirmed_at` is set).
- D-04 — Single-path trigger; RAISE on no-match. [Elevated to requirement] No no-invite branch. On no matching pending invite the trigger RAISEs a clear exception, which rolls back the auth insert.
- D-05 — "No auth user without a pending invite" guardrail is intentional. [Elevated to requirement] A consequence of D-04: you cannot create an auth user (even via dashboard) without first inserting a pending `invites` row. DB-layer security invariant, documented as deliberate.
- D-06 — Revoke/modify-before-acceptance policy. Revoke = `auth.admin.deleteUser` (FK-cascades the profile) + mark the `invites` row `revoked`. Changes = re-issue (no in-place role edit of a pending invite).

**Identity & Security Cleanup**
- D-07 — Edge-function JWT identity cleanup is Phase 14.3 (prerequisite gate), NOT this phase. Phase 15 retains only the invite-coupled identity work (D-02, SPEC req 12). Phase 14.3 must be deployed + verified before real tenants are provisioned.
- D-08 — Cross-org access = service-role edge functions only. All cross-org provisioning and reads (create org, invite first admin, list/resend/revoke invites per client org) run through narrowly-scoped, operation-specific service-role edge functions that bypass RLS. In-function authorization asserts `super_admin` from the JWT. super_admin RLS bypass stays limited to `organizations` only — no new per-table super_admin bypass policies. Cross-org capability stays an auditable, enumerable set of functions, NOT a generic cross-org query proxy.

**Email**
- D-09 — Supabase custom SMTP via Resend (v1). Configure Supabase custom SMTP with Resend as relay; use Supabase's native invite/recovery email + link flows, lightly branded via the template editor. Ops checklist: verify sender domain (SPF/DKIM/DMARC), brand templates, raise the rate limit to survive an invite burst. Custom-branded Resend-API email is a later-phase upgrade, gated on preserving the trigger-firing flow.

**Admin Surfaces**
- D-10 — Platform super_admin panel = dedicated `/admin` route tree. Gated to super_admin at the route (UX) with the service-role edge functions behind it enforcing super_admin from the JWT (the real control). v1 minimal: org list, create-org, invite first admin, pending-invites with resend/revoke.
- D-11 — Org-admin teammate management = new "Team" tab in Settings. Reuses the existing role-gated tab pattern (Templates tab at `Settings.tsx:464`). UI-gated to org admins + server-side enforcement that operations are org-scoped to the caller and role-capped. Teammate invites flow through the same shared invite mechanism (D-01) as every other invite.

**super_admin Bootstrap**
- D-12 — Approach A: committed admin-API script (service role). Idempotent Deno/Node script: upsert internal org (e.g. slug `jamo-internal`) → insert a pending bootstrap `invites` row (role `super_admin`) → `auth.admin.createUser({ email, password, email_confirm: true })` (trigger binds via the single D-02 path) → flip the invites row to `accepted`. Skip if a super_admin already exists. Password env-sourced.

### Claude's Discretion
- Password-reset flow UI — standard `resetPasswordForEmail` + `updateUser`, reuse Login styling.
- Exact `invites.status` enum values (pending/accepted/revoked; add `expired` if useful).
- Whether to build a shared JWT-auth helper module for edge functions (D-07).
- Mechanics of dead-code removal (SPEC req 15).

### Deferred Ideas (OUT OF SCOPE)
- Custom-branded Resend-API emails — later phase; must preserve the native-invite-fires-trigger flow (D-09).
- SSO / OAuth provisioning — future phase; will need its own trigger/provisioning branch (the D-04/D-05 guardrail assumes invite-only inserts in v1).
- Billing / plan enforcement — Milestone 2 (plan is stored, not metered).
- Org deletion / offboarding, admin-action audit logging, multi-org membership — out of scope per SPEC.
</user_constraints>

<phase_requirements>
## Phase Requirements

SPEC.md locks 13 numbered requirements (no ROADMAP-level REQ-IDs were assigned; treated as REQ-15-01..15-13 below in SPEC order).

| ID | Description | Research Support |
|----|-------------|------------------|
| 15-01 | Public signup permanently disabled, config.toml committed, no local/prod divergence | `## Config Values` — exact `config.toml` diffs; dashboard toggle location |
| 15-02 | Internal `/admin` route, super_admin-only | `## Architecture Patterns` Pattern 1 (route gating); reuses `ProtectedRoute`/role check already in `AuthContext.profile.role` |
| 15-03 | Org creation (name+plan, auto slug+uniqueness) | `## Code Examples` slug generation + `## Don't Hand-Roll` (uniqueness retry loop); RLS note on `orgs_super_admin` |
| 15-04 | First-admin invite via `auth.admin`, org/role server-side | `## Code Examples` invite edge function; D-02/D-03 trigger SQL verified |
| 15-05 | Invite acceptance + set-password | `## Common Pitfalls` Pitfall 1 (session-before-password), Pitfall 2 (implicit flow / redirect routing) |
| 15-06 | Org-admin teammate invites (role-capped, own org only) | `## Architecture Patterns` Pattern 2 (same-org vs cross-org split) |
| 15-07 | Org-admin member management (deactivate/remove, role change) | `## Common Pitfalls` Pitfall 3 (no `is_active` column today; `ban_duration` needed for real deactivation) |
| 15-08 | Invite lifecycle: pending list, resend, revoke | `## Common Pitfalls` Pitfall 4 (resend-of-unconfirmed-user GoTrue ambiguity + mitigation) |
| 15-09 | Production SMTP via Resend | `## Config Values` SMTP block + `## Common Pitfalls` Pitfall 5 (rate limit) |
| 15-10 | Password reset flow | `## Code Examples` reset flow; Pitfall 2 applies equally |
| 15-11 | Reproducible super_admin bootstrap | `## Code Examples` bootstrap script skeleton |
| 15-12 | Server-bound identity integrity (trigger hardening) | `## Architecture Patterns` Pattern 3 (trigger SQL), verified against live migration `20260305000013` |
| 15-13 | Remove dead signup code | `## Don't Hand-Roll` n/a — mechanical; see Assumptions Log A1 |
</phase_requirements>

## Summary

Phase 15 replaces a nonexistent provisioning path with a small, well-understood set of Supabase primitives: `auth.admin.inviteUserByEmail` / `createUser` / `generateLink` / `updateUserById` / `deleteUser` for identity lifecycle, a new `invites` table as the single source of truth for org/role binding, a rewritten `handle_new_user` trigger that reads that table, custom SMTP via Resend, and a small set of narrowly-scoped service-role edge functions for cross-org operations. All of the core architectural choices in CONTEXT.md are sound and directly supported by Supabase's documented trigger/RLS/admin-API semantics — I did not find anything that invalidates D-01 through D-12. Three areas need correction or hardening beyond what CONTEXT.md specifies: (1) the "resend" feature (req 8) should NOT rely on calling `inviteUserByEmail` a second time for an already-invited email — GoTrue's behavior here is inconsistently reported across sources (some say it silently resends for unconfirmed users, at least one GitHub issue reports it errors "already registered"); the safe, deterministic implementation is to make resend = revoke-old-invite (delete auth user + mark old `invites` row revoked) + re-run the exact same create-invite code path, which is symmetric with D-06 and sidesteps the ambiguity entirely. (2) `user_profiles` has no `is_active`/deactivation column today — "deactivate a teammate (can no longer authenticate)" (req 7) requires `auth.admin.updateUserById(userId, { ban_duration: '87600h' })` as the actual authentication-blocking mechanism; a denormalized `user_profiles.is_active` boolean is recommended for fast UI reads without extra admin-API round trips. (3) invite and recovery links use Supabase's **implicit flow** (hash-fragment tokens), and this project's plain `createClient()` already defaults to implicit + `detectSessionInUrl: true`, which is compatible — but a session is established the instant the link is clicked, **before** a password is set, and there is no native `onAuthStateChange` event that distinguishes an invite session from a normal login (this exists for `PASSWORD_RECOVERY` but not for invite). The mitigation is architectural, not code-level: give invite acceptance and password reset their own dedicated `redirectTo` routes (e.g. `/accept-invite`, `/reset-password`) so the flow is identified by *which URL the link points at*, never by inspecting the session.

**Primary recommendation:** Build the `invites` table + rewritten trigger first (it is the fan-in dependency for every other requirement), verify it live with a manual `auth.admin.createUser` call against a manually-inserted pending invite row before wiring any UI, then layer the service-role edge functions, then the UI surfaces, then SMTP/Resend, in that order.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Org creation (cross-org, any org) | API / Backend (edge function, service-role) | Database (RLS technically allows it directly, see Pattern 2 note) | D-08 mandates edge-function auditability even though `orgs_super_admin` RLS policy would technically permit a direct authenticated insert |
| First-admin invite (cross-org) | API / Backend (edge function, service-role) | — | Requires `auth.admin` (service-role only, cannot run from browser); target org may differ from super_admin's home org (RLS would block a same-org-only client) |
| Org-admin teammate invite (same org) | API / Backend (edge function, service-role for the `auth.admin` call only) | Database (RLS on `invites` insert can be same-org scoped) | Still needs `auth.admin.inviteUserByEmail` (service-role only), but the org-scoping check can be "caller's own org" — no RLS bypass of tables outside `invites`/`auth` needed |
| Org-admin member management (role change, deactivate) | Database (RLS policy, same-org) + API (edge function only for the `ban_duration` auth-level block) | — | Role/removal within the SAME org can be a same-org RLS UPDATE policy on `user_profiles`; actual authentication blocking requires the service-role `auth.admin.updateUserById` call |
| Invite lifecycle (list/resend/revoke) | API / Backend (edge function, service-role) | Database (RLS-scoped SELECT for org-admin's own-org list) | Revoke needs `auth.admin.deleteUser` (service-role); super_admin cross-org list needs RLS bypass |
| Identity binding (org/role at signup) | Database (Postgres trigger, SECURITY DEFINER) | — | Must be atomic with the `auth.users` INSERT; only a DB trigger can guarantee this (D-02) |
| Email delivery (invite/recovery) | External service (Resend) via Supabase Auth config | — | Supabase Auth's SMTP relay, not app code |
| Admin panel route gating | Browser / Client (route-level UX gate) | API (real enforcement is server-side per-function) | D-10: route gate is UX only, edge functions are the real trust boundary |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.98.0 (installed, verified via `package.json`) [VERIFIED: package.json] | Client SDK — `auth.admin.*` calls (server-side only, in edge functions/scripts), `auth.resetPasswordForEmail`/`updateUser` (browser) | Already the project's sole Supabase client library |
| Supabase Auth (GoTrue) | Hosted, version tied to project `fuuvdcvbliijffogjnwg` | Invite/recovery link issuance, SMTP relay, ban/soft-delete | Already the project's auth provider; no alternative needed |
| Resend | N/A (SMTP relay, no SDK needed for v1) | Production email transport for Supabase Auth emails | D-09 locked; Supabase has a first-party Resend partner integration [CITED: supabase.com/partners/integrations/resend] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new required | — | Slug generation is ~10 lines of vanilla JS/SQL (lowercase, strip non-alnum, hyphenate, uniqueness-suffix loop) | No slugify library is currently installed (`grep` for `slugify`/`slug` in `package.json` returned nothing) — do not add one for this; see Code Examples |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated `invites` table (D-01) | `app_metadata` on `auth.users` | Rejected in CONTEXT.md — correct: `inviteUserByEmail` does not set `app_metadata`, and a post-hoc `updateUserById` call would race the `AFTER INSERT` trigger |
| Native Supabase invite emails (D-09) | Custom Resend-API emails (generate link + send via Resend SDK) | Gives full template control but loses the "native invite creates the row via `auth.admin`" simplicity and requires you to build+maintain your own token/redirect handling; correctly deferred |
| Trigger-reads-invites (D-02) | A `before_user_created` Auth Hook (Supabase's newer hook-based extensibility point) | Auth Hooks run as part of the GoTrue request pipeline (HTTP/pg-function callback) rather than a plain Postgres trigger; more moving parts, no benefit here since the existing trigger approach is already atomic and proven in this codebase — not recommended |

**Installation:** No new packages required — `@supabase/supabase-js` is already installed at the version needed.

**Version verification:** `@supabase/supabase-js@2.98.0` confirmed via `grep supabase-js package.json` — no `npm view` needed since this is a repo-local check, not a fresh recommendation.

## Architecture Patterns

### System Architecture Diagram

```
[Super Admin Browser: /admin]                [Org Admin Browser: Settings > Team]
        |                                              |
        | (JWT)                                        | (JWT)
        v                                              v
+-------------------------+                +--------------------------+
| edge fn: admin-create-org|                | edge fn: team-invite     |
| edge fn: admin-invite    |                | edge fn: team-manage     |
| edge fn: admin-invites-  |                | (role-capped: admin/user |
|   list/resend/revoke     |                |  only, own org only)     |
+-------------------------+                +--------------------------+
        |  getAuthedUserAndOrg()                        |  getAuthedUserAndOrg()
        |  + assert role==='super_admin'                |  + assert role IN ('admin','super_admin')
        |  + service-role client (bypasses RLS)          |  + org check == caller org_id
        v                                              v
   +----------------------------------------------------------+
   |                     Postgres (hosted)                     |
   |  organizations (RLS: super_admin bypass exists)            |
   |  invites (new table; RLS: own-org select/insert)           |
   |  user_profiles (RLS: self-update only today; NEW same-org  |
   |     admin-update policy needed for req 7 role/deactivate)  |
   +----------------------------------------------------------+
        |
        | auth.admin.inviteUserByEmail(email,{data:{},redirectTo})
        v
   +----------------------------------------------------------+
   |  auth.users INSERT  -->  AFTER INSERT trigger              |
   |  handle_new_user(): SELECT org_id, role FROM invites       |
   |    WHERE lower(email)=lower(NEW.email) AND status='pending'|
   |    -> INSERT user_profiles (atomic, same transaction)      |
   |    -> no match: RAISE EXCEPTION (rolls back auth insert)   |
   +----------------------------------------------------------+
        |
        v  (Resend relay via Supabase custom SMTP)
   [Invitee inbox] --click link--> [/accept-invite route]
        |  (implicit-flow hash tokens auto-consumed by supabase-js;
        |   detectSessionInUrl:true establishes session BEFORE password set)
        v
   supabase.auth.updateUser({ password }) --> full session, redirect to app
```

### Recommended Project Structure
```
supabase/
├── migrations/
│   └── 202607XXXXXXXX_invites_and_trigger_hardening.sql   # invites table + RLS + rewritten handle_new_user
├── functions/
│   ├── admin-create-org/            # super_admin only, service-role
│   ├── admin-invite-first-admin/    # super_admin only, service-role
│   ├── admin-invites-lifecycle/     # list/resend/revoke, super_admin cross-org
│   ├── team-invite/                 # org-admin, same-org, role-capped
│   ├── team-manage/                 # org-admin, same-org role change + deactivate (ban_duration)
│   └── _shared/auth.ts              # existing getAuthedUserAndOrg/isInternalServiceRoleCall (14.3) — reuse
scripts/
└── bootstrap-super-admin.ts          # D-12 idempotent script
src/
├── pages/
│   ├── AdminPanel.tsx (or admin/ subtree)   # /admin route
│   ├── AcceptInvite.tsx                     # dedicated redirectTo target
│   ├── ForgotPassword.tsx
│   └── ResetPassword.tsx                    # dedicated redirectTo target
└── components/settings/
    └── TeamTab.tsx                          # D-11, mirrors TemplatesTab.tsx pattern
```

### Pattern 1: Route-level role gate (extends existing `ProtectedRoute`)
**What:** `/admin` renders only for `profile.role === 'super_admin'`; the real enforcement is server-side (Pattern 2), this is UX-only per D-10.
**When to use:** Any route restricted by role where the underlying data operations are already independently authorized.
**Example:**
```tsx
// Source: existing src/components/ProtectedRoute.tsx pattern, extended
export function SuperAdminRoute() {
  const { profile, loading } = useAuth()
  if (loading) return <Loading />
  if (!profile || profile.role !== 'super_admin') return <Navigate to="/" replace />
  return <Outlet />
}
// App.tsx: nest under existing <Route element={<ProtectedRoute />}> so unauth still hits /login first
```

### Pattern 2: Same-org vs cross-org authorization split (refines D-08)
**What:** Not every invite-related operation needs a service-role RLS bypass. Only operations that cross the caller's own org boundary need the full `getAuthedUserAndOrg` + service-role pattern from 14.3. Same-org operations (org-admin inviting/managing their OWN teammates) can enforce `org_id = caller_org_id` as an explicit application-level check inside a thinner edge function, or even a same-org RLS policy for the parts that don't require `auth.admin` (e.g. reading pending invites, updating a teammate's role).
**When to use:** Every new edge function in this phase — classify it as cross-org (super_admin panel: `admin-*`) or same-org (org-admin: `team-*`) before writing the authorization check.
**Example:**
```sql
-- NEW RLS policy needed for req 7 (role change/removal within org) — user_profiles
-- currently only allows self-update (see supabase/migrations/20260305000013_rls_policies.sql:26-28)
CREATE POLICY "profiles_admin_update_same_org" ON user_profiles
  FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  )
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));
```
This lets an org admin change a teammate's `role` column value directly via the normal authenticated client (no edge function needed for the DB write) — but the *authentication-blocking* part of "deactivate" still requires a service-role edge function calling `auth.admin.updateUserById` (RLS cannot touch `auth.users`).

### Pattern 3: Rewritten `handle_new_user` trigger (D-02/D-03/D-04)
**What:** Replaces the current client-metadata-trusting trigger (`supabase/migrations/20260305000013_rls_policies.sql:82-98`) with one that reads the `invites` table.
**Verified against:** live migration file (read directly), and Supabase/Postgres semantics — a `SECURITY DEFINER` function's privileges come from its owner (the role that ran the migration, `postgres` on hosted Supabase), which owns `public.invites` and is therefore unaffected by RLS on that table regardless of policies defined on it (RLS only restricts non-owner roles unless `FORCE ROW LEVEL SECURITY` is set, which this project does not use anywhere) — same mechanism the existing `private.get_user_org_id()` helper already relies on to read `user_profiles` [VERIFIED: codebase precedent, `supabase/migrations/20260305000012_rls_helper_functions.sql`].
```sql
-- Source: rewritten from supabase/migrations/20260305000013_rls_policies.sql:82-98 per D-02/D-03/D-04
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  SELECT org_id, role INTO v_org_id, v_role
  FROM invites
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'no pending invite for %', NEW.email;
  END IF;

  INSERT INTO user_profiles (user_id, org_id, role, full_name)
  VALUES (
    NEW.id,
    v_org_id,
    v_role,
    NEW.raw_user_meta_data->>'full_name'  -- cosmetic only, never org/role
  );

  RETURN NEW;
END;
$$;
-- Trigger definition (AFTER INSERT ON auth.users) is unchanged — only the function body changes.
```
**Why `ORDER BY created_at DESC LIMIT 1` matters:** if a revoke-and-reissue resend (Pitfall 4 mitigation) leaves more than one `pending`-adjacent row transiently, this guarantees the newest wins; the revoke step should still flip the old row to `revoked` *before* the reissue for defense in depth, so in the steady state only one `pending` row per email ever exists.

### Anti-Patterns to Avoid
- **Trusting `onAuthStateChange` event type to distinguish invite/recovery flows:** `PASSWORD_RECOVERY` is a real, documented event for the reset-password flow, but invite links carry no equivalent marker — the resulting session is indistinguishable from a normal `SIGNED_IN` [CITED: github.com/supabase/supabase/issues/45210]. Use dedicated `redirectTo` routes instead (see Summary + Pitfall 2).
- **Calling `inviteUserByEmail` a second time on the same still-pending email for "resend":** reported GoTrue behavior is inconsistent across versions/reports (see Pitfall 4). Don't build resend on top of an unverified retry.
- **Adding a new per-table `super_admin` bypass RLS policy for `invites` or `user_profiles`:** D-08 explicitly forbids this ("no new per-table super_admin bypass policies — would smear the trust boundary"). Cross-org reads/writes go through service-role edge functions, not broadened RLS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Invite token generation/expiry/signing | Custom signed-token invite links | `auth.admin.inviteUserByEmail` / `generateLink` | Supabase's GoTrue already handles token hashing, expiry (`otp_expiry`, defaults to 1h — note SPEC says "Supabase defaults" so confirm this is acceptable for a multi-day sales-provisioning flow, or raise `otp_expiry` in `auth.email`) and single-use consumption |
| Password set/reset UI cryptography | Custom password-set token verification | `supabase.auth.updateUser({ password })` while the implicit-flow session from the link is active | The link itself IS the auth; no separate token verification needed once the client has consumed the hash fragment |
| Deactivating a user's ability to log in | A custom `is_active` check inside every RLS policy / app guard | `auth.admin.updateUserById(userId, { ban_duration })` | RLS policies don't gate `auth.users`/session issuance; a banned user is rejected at the GoTrue layer before any RLS is evaluated |
| Slug uniqueness | A distributed lock / retry-forever loop | Insert with generated slug, catch the `organizations.slug` UNIQUE violation (Postgres error code `23505`), append a short suffix, retry a bounded number of times (e.g. 5) | The UNIQUE constraint already exists (`organizations.slug UNIQUE NOT NULL`) — let Postgres be the source of truth, don't pre-check-then-insert (race window) |

**Key insight:** Every "hard part" of this phase (token issuance, expiry, single-use links, ban enforcement) is already implemented inside Supabase Auth/GoTrue. The phase's actual engineering work is the `invites` table + trigger (server-bound identity) and the authorization plumbing around it (Pattern 2) — not cryptography or token management.

## Common Pitfalls

### Pitfall 1: Invite/recovery links authenticate the browser BEFORE a password is set
**What goes wrong:** Supabase's implicit flow (used by both `inviteUserByEmail` and `resetPasswordForEmail` links — PKCE is explicitly unsupported for `inviteUserByEmail` [CITED: community reports + Supabase PKCE docs on supported routes]) delivers `access_token`/`refresh_token` in the URL hash fragment. The client's default `detectSessionInUrl: true` consumes this on load and establishes a real, working session — before the user has typed a new password. A confirmed open GoTrue issue documents exactly this: "invite and recovery links create a persistent authenticated session before password is set" [CITED: github.com/supabase/supabase/issues/45210].
**Why it happens:** GoTrue's design treats "clicking the emailed link" as sufficient proof of email ownership and issues a session immediately; setting the password is a separate, subsequent `updateUser` call your app must force.
**How to avoid:** Give the invite-accept and password-reset flows their own dedicated routes (`/accept-invite`, `/reset-password`) passed as `redirectTo` when calling `inviteUserByEmail`/`resetPasswordForEmail`. These routes must NOT be part of the generic `ProtectedRoute` tree that lets any session through to the main app — they should present the "set your password" form and only navigate into the app after `updateUser` succeeds. Do not rely on `onAuthStateChange` event type to gate this (see Pitfall 2).
**Warning signs:** A user who clicks an invite link and then manually navigates the browser (back button, typing a URL) lands inside the live app with an unset/default password — acceptable only if the set-password step is the very next forced action, not a "skippable" step.

### Pitfall 2: No native signal distinguishes an "invite" session from a normal login — recovery has `PASSWORD_RECOVERY`, invite does not
**What goes wrong:** `supabase.auth.onAuthStateChange` fires `PASSWORD_RECOVERY` for recovery links (though note: it fires `SIGNED_IN` first, then `PASSWORD_RECOVERY` — a known GoTrue quirk [CITED: github.com/orgs/supabase/discussions/18059]), but for invite links there is **no equivalent event** — the session is a plain `SIGNED_IN` with nothing distinguishing it from a normal password login [CITED: github.com/supabase/supabase/issues/45210].
**Why it happens:** The `type=invite`/`type=recovery` marker exists only in the URL hash at the moment of the callback; once consumed, the resulting session object carries no such marker.
**How to avoid:** Don't try to detect "is this an invite" from auth state. Detect it from the ROUTE: only `/accept-invite` and `/reset-password` present the password-set form, and they are reachable only via the `redirectTo` URL Supabase put in the email. For recovery specifically, `PASSWORD_RECOVERY` can be used as a secondary confirmation but is not required.
**Warning signs:** Any code that branches on `event === 'SIGNED_IN'` and tries to infer "this must be an invite" — it cannot reliably do so.

### Pitfall 3: `user_profiles` has no deactivation column today — "deactivate" (req 7) needs an Auth-level ban, not just a DB flag
**What goes wrong:** Reading `supabase/migrations/20260305000003_user_profiles.sql` directly confirms the only columns are `id, user_id, org_id, role, full_name, avatar_url, created_at, updated_at` — **no `is_active`/`deactivated_at`**. A UI that merely flips a hypothetical local flag would NOT satisfy the acceptance criterion "that user can no longer authenticate/access."
**Why it happens:** RLS policies gate data access for an already-authenticated session; they do nothing to prevent a banned-in-name-only user from continuing to log in and refresh tokens.
**How to avoid:** Use `auth.admin.updateUserById(userId, { ban_duration: '87600h' })` (10 years — effectively permanent; `'none'` lifts it) as the actual authentication-blocking mechanism [CITED: supabase.com/docs/reference/javascript/auth-admin-updateuserbyid + community verification]. Add a migration for `user_profiles.is_active BOOLEAN NOT NULL DEFAULT true` as a denormalized, fast-to-query mirror for the UI list (avoids an admin-API round trip per row render); the edge function that deactivates a user sets BOTH the ban and the flag in the same call.
**Warning signs:** A "deactivated" user who can still successfully call `signInWithPassword` — this is the acceptance-criterion failure mode.

### Pitfall 4: Resend of a still-pending invite may not behave the way D-06/req 8 assumes
**What goes wrong:** Calling `auth.admin.inviteUserByEmail` a second time for an email that already has an unconfirmed `auth.users` row is reported inconsistently: one Supabase doc/community answer states inviting an email "that already belongs to a confirmed user returns an error" (implying unconfirmed does NOT error, i.e. resend works), while an open GoTrue GitHub issue is literally titled "Resending of invitation email doesn't work" and reports an "already registered" error on retry [CITED: github.com/supabase/auth/issues/2180]. This is genuinely ambiguous across sources and versions — do not build the resend feature assuming either behavior without a live smoke test against this project first.
**Why it happens:** GoTrue's invite endpoint has changed behavior across versions regarding whether an existing-but-unconfirmed user blocks a repeat invite call.
**How to avoid:** Implement "resend" as **revoke-then-reissue** using the exact same code path as D-06's revoke (mark old `invites` row `revoked` + `auth.admin.deleteUser` on the stale, still-unconfirmed `auth.users` row) followed by the exact same create-invite path used for a brand-new invite (new `invites` row `pending` → `inviteUserByEmail`). This is symmetric with an already-locked decision (D-06), guarantees a fresh `auth.users` row every time, and completely sidesteps the ambiguous "invite an existing unconfirmed email" behavior. Flag this as a deviation from a literal reading of D-06 (which frames resend and revoke as separate operations) — recommend the planner treat resend as "revoke, then create" under the hood.
**Warning signs:** A resend button that silently no-ops or throws "already registered" in the live project — verify with one real resend attempt early (Wave 0/1), not at the end of the phase.

### Pitfall 5: Custom SMTP does not remove all rate limits — it raises the default from 2/hour but a new lower default (30/hour) still applies until explicitly raised
**What goes wrong:** Supabase's default email sender is capped at ~2 emails/hour; switching to custom SMTP does not mean unlimited — a new default of 30 emails/hour is imposed and must be explicitly raised in the dashboard's Auth > Rate Limits page for an invite burst (e.g. bulk-onboarding several client orgs at once) [CITED: supabase.com/docs/guides/auth/rate-limits + github.com/orgs/supabase/discussions/15896].
**Why it happens:** The limit exists independently of which SMTP relay is configured; it is a GoTrue-level throttle, not a Resend-level one.
**How to avoid:** After configuring Resend SMTP, explicitly raise `rate_limit.email_sent` (config.toml local value, and the equivalent hosted-dashboard Auth > Rate Limits setting for the live project) to a value that comfortably covers expected invite-burst volume (e.g. 100+/hour).
**Warning signs:** Invites silently failing to send during a multi-client onboarding session with no visible error beyond a 429 from the Auth API.

### Pitfall 6: `redirectTo` is silently ignored if not in the allow-list — the user ends up on the wrong page with no error
**What goes wrong:** If the `redirectTo` URL passed to `inviteUserByEmail`/`resetPasswordForEmail` is not present in the project's `additional_redirect_urls` (config.toml) / hosted "Redirect URLs" allow-list, Supabase silently falls back to the Site URL instead of raising an error.
**Why it happens:** This is a deliberate anti-open-redirect security measure, but it manifests as a confusing "the link just goes to the wrong place" bug with zero error signal.
**How to avoid:** Add `/accept-invite` and `/reset-password` (both local `http://127.0.0.1:3000/...` and the production Netlify domain) to `additional_redirect_urls` in `config.toml` AND the hosted dashboard's Auth > URL Configuration before wiring the invite/reset code.
**Warning signs:** Invite/reset links redirect to the login page or dashboard root instead of the intended set-password page, with no console/network error.

## Code Examples

### Slug generation with uniqueness retry (req 3)
```typescript
// No new library needed — plain JS + Postgres UNIQUE constraint as source of truth
function baseSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function createOrgWithUniqueSlug(supabaseAdmin: SupabaseClient, name: string, plan: string) {
  const base = baseSlug(name)
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .insert({ name, slug: candidate, plan })
      .select()
      .single()
    if (!error) return data
    if (error.code !== '23505') throw error // not a unique violation — real error
    // else loop and retry with next suffix
  }
  throw new Error('Could not generate a unique slug after 6 attempts')
}
```

### Invite creation edge function shape (D-01/D-02/D-03, req 4 and req 6 share this core)
```typescript
// Source: pattern synthesized from D-01/D-02/D-03 + existing _shared/auth.ts (14.3)
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  try {
    const { userId, orgId: callerOrgId } = await getAuthedUserAndOrg(req, corsHeaders)
    const { email, targetOrgId, role } = await req.json()

    // Authorization branch — this is Pattern 2's split:
    // admin-invite-first-admin: assert caller role === 'super_admin' (any targetOrgId)
    // team-invite: assert targetOrgId === callerOrgId AND role !== 'super_admin'

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) // bypasses RLS

    // D-03 step 1: insert invites row FIRST, committed, before touching auth.admin
    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .insert({ email: email.toLowerCase(), org_id: targetOrgId, role, invited_by: userId, status: 'pending' })
      .select()
      .single()
    if (inviteErr) return jsonError(400, inviteErr.message, corsHeaders)

    // D-03 step 2: auth.admin call — trigger fires here, finds the already-committed row
    const { error: inviteEmailErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${SITE_URL}/accept-invite`,
    })
    if (inviteEmailErr) {
      // Compensate: don't leave an orphan pending invite with no corresponding auth flow
      await admin.from('invites').update({ status: 'revoked' }).eq('id', invite.id)
      return jsonError(400, inviteEmailErr.message, corsHeaders)
    }

    return new Response(JSON.stringify({ invite }), { headers: corsHeaders })
  } catch (e) {
    if (e instanceof Response) return e
    throw e
  }
})
```

### Deactivate a teammate (req 7, Pitfall 3)
```typescript
// team-manage edge function — same-org check first, then the two writes
const { error: banErr } = await admin.auth.admin.updateUserById(targetUserId, { ban_duration: '87600h' })
if (banErr) return jsonError(400, banErr.message, corsHeaders)
await admin.from('user_profiles').update({ is_active: false }).eq('user_id', targetUserId)
```

### Password reset flow (req 10, Claude's Discretion)
```typescript
// ForgotPassword.tsx
await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })

// ResetPassword.tsx — mounted at the dedicated /reset-password route
// Session already established by implicit-flow hash consumption (Pitfall 1/2) by the time this mounts
const { error } = await supabase.auth.updateUser({ password: newPassword })
```

### Bootstrap script shape (D-12, req 11)
```typescript
// scripts/bootstrap-super-admin.ts — idempotent, service-role, env-sourced password
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Skip if a super_admin already exists (idempotency)
const { data: existing } = await admin.from('user_profiles').select('id').eq('role', 'super_admin').limit(1)
if (existing && existing.length > 0) { console.log('super_admin already exists, skipping'); Deno.exit(0) }

// Upsert internal org (idempotent on slug)
const { data: org } = await admin.from('organizations')
  .upsert({ name: 'Jamo Internal', slug: 'jamo-internal', plan: 'internal' }, { onConflict: 'slug' })
  .select().single()

const email = Deno.env.get('BOOTSTRAP_SUPER_ADMIN_EMAIL')!
const password = Deno.env.get('BOOTSTRAP_SUPER_ADMIN_PASSWORD')!

const { data: invite } = await admin.from('invites')
  .insert({ email, org_id: org.id, role: 'super_admin', status: 'pending' })
  .select().single()

const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (error) throw error // trigger already ran synchronously inside createUser's INSERT

await admin.from('invites').update({ status: 'accepted' }).eq('id', invite.id)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `handle_new_user` trusts `raw_user_meta_data` client-supplied `org_id`/`role` | Trigger reads server-authoritative `invites` table | This phase (D-02) | Closes the SPEC req-12 tamper vector directly |
| No production email transport (commented `config.toml` SMTP block) | Resend via Supabase custom SMTP | This phase (D-09) | Unblocks every email-dependent requirement (4,5,8,9,10) |
| No admin-API-based auth hooks in this repo | Optional newer Auth Hooks (`before_user_created`) exist in `config.toml` as commented-out stubs | Available but NOT recommended for this phase — see Alternatives Considered | Plain trigger approach is simpler and already proven; don't introduce Auth Hooks here |

**Deprecated/outdated:** N/A — no existing invite/provisioning code exists to deprecate; this is greenfield within an established schema.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GoTrue's exact behavior when re-inviting an already-invited unconfirmed email is ambiguous across sources (some say it works, at least one GitHub issue says it errors) | Pitfall 4 | If it turns out `inviteUserByEmail` DOES cleanly resend for unconfirmed users, the recommended revoke-then-reissue mitigation is extra defensive work, not wrong — low risk either way, but worth a 5-minute live smoke test before committing to either implementation |
| A2 | `otp_expiry` (config.toml default 3600s = 1 hour) applies to invite links the same way it applies to OTP/magiclink — SPEC says "Supabase defaults" are acceptable, but a 1-hour invite-link expiry may be too short for a sales-led onboarding flow where the invitee may not check email immediately | Don't Hand-Roll table | If 1 hour is too short in practice, the "resend" feature (req 8) is the designed mitigation — not a blocker, but the planner/human should confirm 1 hour is acceptable or explicitly raise `otp_expiry` |
| A3 | The `orgs_super_admin` RLS policy (`FOR ALL` with only a `USING` clause, no explicit `WITH CHECK`) implicitly applies `USING` as `WITH CHECK` for INSERT per standard Postgres RLS semantics, meaning a super_admin's own authenticated client COULD insert directly into `organizations` without going through an edge function | Architectural Responsibility Map | Low risk — D-08 mandates the edge-function path anyway for auditability, so this is documentation-only; if wrong, it just means the RLS is even MORE permissive than assumed, not less (no security downgrade) |

## Open Questions

1. **Exact `invites.status` enum values**
   - What we know: CONTEXT.md leaves this to Claude's discretion; `pending`/`accepted`/`revoked` are required by the decisions above, `expired` is optional.
   - What's unclear: Whether an `expired` status is worth adding given Supabase's own link expiry already makes an unaccepted invite non-functional after `otp_expiry` — a separate app-level `expired` status would need a cron/check to set it, since Postgres won't do this automatically.
   - Recommendation: Skip `expired` for v1 unless the admin UI specifically wants to visually distinguish "still within expiry window" from "past expiry, needs resend" — a computed value (`created_at + otp_expiry < now()`) can approximate this without a stored status.

2. **Whether the org-admin "Team" invite path needs its own edge function or can share `admin-invite-first-admin`'s function with a parameter**
   - What we know: Pattern 2 in this document recommends splitting by authorization shape (same-org vs cross-org), which argues for separate functions per D-08's "operation-specific" preference.
   - What's unclear: Whether code duplication between `admin-invite-first-admin` and `team-invite` (both ultimately call the same `invites` insert + `inviteUserByEmail` sequence) is worth factoring into a shared non-HTTP helper module (like `_shared/auth.ts`) vs. two small standalone functions.
   - Recommendation: Extract a shared `_shared/invites.ts` helper for the "insert pending invite + call inviteUserByEmail + compensate on failure" sequence (Code Examples above), called by both edge functions with different authorization pre-checks. Keeps D-08's "operation-specific" boundary while avoiding duplicated D-03 sequencing logic.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase hosted project `fuuvdcvbliijffogjnwg` | All requirements | Assumed ✓ (existing project, referenced throughout STATE.md) | — | — |
| Supabase CLI | Edge function deploy, local dev | Not verified in this research pass — prior phases (14.3, 14.6) report successful `supabase functions deploy` and MCP `apply_migration` usage in STATE.md | — | Supabase MCP `apply_migration` tool (used successfully in Phase 14.6 per STATE.md) as an alternative to `supabase db push`, which is confirmed diverged/unusable per CONTEXT.md |
| Resend account + verified sending domain | Req 9 | Not verified — no evidence in repo of an existing Resend account/API key | — | None — this is a hard external dependency; the planner must include a manual setup step (domain verification, SPF/DKIM/DMARC DNS records) as a Wave 0/human-checkpoint task, not something the executor agent can complete unattended |
| `SUPABASE_ACCESS_TOKEN` env var | Management API migration path | Not verified in this pass | — | Supabase MCP tools if the access token path is unavailable |

**Missing dependencies with no fallback:**
- Resend account + DNS-verified sending domain — requires a human with DNS access to the sending domain; cannot be completed by an execution agent.

**Missing dependencies with fallback:**
- `supabase db push` (diverged) — Supabase MCP `apply_migration` (confirmed working in Phase 14.6 per STATE.md commit history) or raw Management API SQL execution.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 (client/edge-adjacent unit tests) + Deno's built-in test runner for edge functions (`test.ts` files, `ignore:true` pattern used throughout this repo when live Deno execution isn't available in the dev sandbox — see 14.3 plans) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` (no separate coverage/full-suite split currently used per STATE.md: "No --coverage flag to keep runs under 15 seconds") |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 15-01 | Signup disabled, config committed | unit/static | grep-based config assertion in a Vitest test reading `config.toml` text | ❌ Wave 0 |
| 15-02 | `/admin` gated to super_admin | unit (component) | `npm run test:run -- SuperAdminRoute` | ❌ Wave 0 |
| 15-03 | Org creation + unique slug | unit (pure fn) | `npm run test:run -- slug` (test `baseSlug`/retry logic directly, mock Supabase client) | ❌ Wave 0 |
| 15-04 | First-admin invite server-bound | Deno test (`ignore:true` scaffold, live-verify deferred per repo convention) | `deno test supabase/functions/admin-invite-first-admin/test.ts` (or grep-based acceptance per 14.3 contingency if Deno unavailable) | ❌ Wave 0 |
| 15-05 | Invite acceptance + password set | manual-only (live email + real link click cannot be automated in this stack) | N/A — human-verify checkpoint | — |
| 15-06 | Org-admin teammate invite, own-org only | Deno test (authorization predicate) | `deno test supabase/functions/team-invite/test.ts` | ❌ Wave 0 |
| 15-07 | Member management (role change, deactivate) | Deno test (`ban_duration` call asserted) + unit (RLS policy predicate, if testable) | `deno test supabase/functions/team-manage/test.ts` | ❌ Wave 0 |
| 15-08 | Invite lifecycle (list/resend/revoke) | Deno test + manual-only for actual email resend confirmation | `deno test supabase/functions/admin-invites-lifecycle/test.ts` | ❌ Wave 0 |
| 15-09 | Resend SMTP delivers | manual-only (external email delivery cannot be asserted in CI) | N/A — human-verify checkpoint, check external inbox | — |
| 15-10 | Password reset flow | unit (component) + manual-only for live email | `npm run test:run -- ResetPassword` | ❌ Wave 0 |
| 15-11 | super_admin bootstrap idempotent | Deno/Node test (run script twice against a test DB, assert second run no-ops) | `deno test scripts/bootstrap-super-admin.test.ts` | ❌ Wave 0 |
| 15-12 | Trigger RAISEs on no-match, tamper-proof | SQL-level test (direct `INSERT INTO auth.users` without a pending invite, assert exception) — requires a live DB connection, likely a manual/live-verify item given Deno-unavailable pattern used throughout this repo | manual-only or `psql`-based script if a test DB is reachable | ❌ Wave 0 |
| 15-13 | Dead code removed | static/grep | `grep -rn "signUp\|Test Org" src/` returns no hits (existing SPEC acceptance criterion is itself a grep) | N/A (grep, not a test file) |

### Sampling Rate
- **Per task commit:** `npm run test:run` (client-side unit tests) + `deno test <changed-function>/test.ts` where Deno is available in the execution environment (this repo has repeatedly hit "Deno unavailable in this dev environment" per STATE.md 14.3 entries — fall back to grep-based acceptance checks matching the established contingency pattern).
- **Per wave merge:** Full `npm run test:run` + a live smoke pass against the actual hosted Supabase project for anything DB-trigger-related (Pitfall 4's live resend test, req 12's tamper test) since these cannot be meaningfully unit-tested against a mock.
- **Phase gate:** Full suite green + the mandatory human-verify checkpoints for reqs 5, 9, 10 (live email delivery/link-click cannot be automated) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `supabase/functions/admin-invite-first-admin/test.ts`, `team-invite/test.ts`, `team-manage/test.ts`, `admin-invites-lifecycle/test.ts` — Deno stub scaffolds (`ignore:true` where live Deno unavailable), covering reqs 4, 6, 7, 8
- [ ] `scripts/bootstrap-super-admin.test.ts` — covers req 11 idempotency
- [ ] `src/components/SuperAdminRoute.test.tsx` — covers req 2
- [ ] A pure-function unit test file for slug generation/retry logic — covers req 3
- [ ] No client-side test framework gap exists (Vitest already fully configured); the gap is entirely new test FILES for new code, not framework setup

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (GoTrue) — do not hand-roll; `ban_duration` for account disablement, standard password policy (`minimum_password_length` in config.toml, currently 6 — consider raising) |
| V3 Session Management | yes | Supabase JWT session handling (existing, unchanged by this phase) — Pitfall 1/2 concern how sessions are established via magic links, not session mechanics themselves |
| V4 Access Control | yes | RLS policies (org-scoped) + service-role edge-function authorization checks (D-08); this phase's core security surface is req 12 (server-bound identity) |
| V5 Input Validation | yes | Email lowercasing/normalization in `invites` table lookups (`lower(email)=lower(NEW.email)`); role value validated against the fixed `super_admin`/`admin`/`user` set server-side, never trusting client-supplied role beyond the invite record |
| V6 Cryptography | no (n/a) | No new cryptography — all token/link cryptography is handled internally by Supabase Auth |

### Known Threat Patterns for Supabase multi-tenant provisioning

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client tampers with `org_id`/`role` in the acceptance request | Tampering | D-02: trigger reads ONLY from server-side `invites` table, never client-supplied `raw_user_meta_data`/body — this is the phase's core requirement (req 12) |
| Org admin invites a `super_admin` into their own org (privilege escalation) | Elevation of Privilege | D-01's "role-capped creation" — `team-invite` edge function must reject `role='super_admin'` outright, only allow `admin`/`user` |
| Org admin targets another org's `invites`/`user_profiles` row | Tampering / EoP | Pattern 2: same-org check (`targetOrgId === callerOrgId`) enforced server-side in every `team-*` function, never trusting a client-supplied `org_id` |
| Stale/revoked invite link still works | Tampering | D-06: revoke = `deleteUser` (kills the underlying `auth.users` row the link's token is bound to) + `invites.status='revoked'`; trigger's `status='pending'` filter also means a revoked row can never bind even if somehow the auth flow completed |
| Cross-tenant impersonation via edge-function body identity | Spoofing | Out of scope for Phase 15 itself but a **hard prerequisite** — Phase 14.3 must be deployed and verified first (D-07); this phase's new edge functions must use the SAME `getAuthedUserAndOrg` pattern from `_shared/auth.ts`, not reintroduce body-trust |
| Open redirect via unvalidated `redirectTo` | Tampering | Supabase's own allow-list (`additional_redirect_urls`) already mitigates this at the platform level — Pitfall 6 is about it silently failing, not about it being insecure |

## Sources

### Primary (HIGH confidence)
- Live codebase files (read directly): `supabase/migrations/20260305000013_rls_policies.sql`, `20260305000012_rls_helper_functions.sql`, `20260305000002_organizations.sql`, `20260305000003_user_profiles.sql`, `supabase/config.toml`, `supabase/functions/_shared/auth.ts`, `src/context/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/lib/supabase.ts`, `src/App.tsx`, `package.json`
- `.planning/phases/15-client-onboarding-provisioning/15-SPEC.md`, `15-CONTEXT.md`, `.planning/phases/14.3-edge-identity-hardening/14.3-SPEC.md`, `.planning/STATE.md` — locked requirements/decisions and prior-phase precedent (Supabase MCP `apply_migration` usage, Deno-unavailable contingency pattern)

### Secondary (MEDIUM confidence)
- supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail, auth-admin-generatelink, auth-admin-updateuserbyid — official API reference (options/signatures)
- supabase.com/docs/guides/auth/auth-smtp, supabase.com/partners/integrations/resend — SMTP/Resend configuration
- supabase.com/docs/guides/auth/rate-limits — custom-SMTP rate limit defaults (30/hour) and where to raise them
- supabase.com/docs/guides/auth/sessions/pkce-flow, implicit-flow — flow-type defaults and PKCE support matrix
- github.com/supabase/supabase/issues/45210 — invite/recovery session-before-password confirmed open issue
- github.com/orgs/supabase/discussions/18059 — recovery event ordering (SIGNED_IN before PASSWORD_RECOVERY)

### Tertiary (LOW confidence — flagged in Assumptions Log)
- github.com/supabase/auth/issues/2180, github.com/orgs/supabase/discussions/3526, and assorted community/blog posts on "resend invite" behavior — genuinely contradictory across sources on whether re-inviting an unconfirmed user errors; mitigated via the revoke-then-reissue design recommendation (Pitfall 4) rather than resolved by finding the "true" current behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, versions confirmed directly from `package.json`
- Architecture (trigger/RLS/D-01-D-12 feasibility): HIGH — verified directly against live migration files and standard, well-documented Postgres/Supabase semantics
- Pitfalls (session-before-password, resend ambiguity, deactivation mechanism): MEDIUM — the underlying platform facts are CITED from official docs/issues, but exact current-version GoTrue behavior for the resend edge case is genuinely contested across sources (mitigated by a design recommendation, not fully resolved)

**Research date:** 2026-07-13
**Valid until:** 30 days (Supabase Auth API surface is stable; re-verify if `@supabase/supabase-js` is upgraded past 2.98.x or if GoTrue changes invite/resend behavior — worth a quick live smoke test at execution time regardless per Pitfall 4)
