# Phase 15: Client Onboarding & Provisioning — Specification

**Created:** 2026-07-03
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 15 locked

## Goal

Replace the (now-dead) self-serve demo signup with a sales-led, invite-only provisioning system: a platform super_admin creates a client organization and invites its first admin by email; that org admin sets their own password, then invites and manages their own teammates — all over production email (Resend) with org/role identity bound server-side.

## Background

Jamo is a multi-tenant B2B SaaS (React/Vite + Supabase, project ref `fuuvdcvbliijffogjnwg`), currently deployed as an interim Netlify demo. Scouting the codebase established current state:

- **Auth/signup:** `signUp()` still exists in `src/context/AuthContext.tsx:76-83`, but the Login signup toggle is permanently dead (`src/pages/Login.tsx:18` — `const [isSignUp] = useState(false)`, no setter). Signup JSX and hardcoded Test Org A/B UUIDs remain unreachable in `Login.tsx:112-146`. There is **no** server-side or admin path to create a user.
- **Organizations:** `organizations` table exists (`supabase/migrations/20260305000002_organizations.sql` — columns `id, name, slug UNIQUE, plan default 'trial', is_active, feature_flags jsonb, timestamps`). **Zero** org-creation code path — orgs are created manually in SQL today.
- **user_profiles + roles:** `user_profiles` (`...000003`) has `org_id NOT NULL FK`, `role default 'user'`; roles are `super_admin` / `admin` / `user`. Trigger `handle_new_user()` (`...000013_rls_policies.sql:82-98`, SECURITY DEFINER) reads `org_id`/`role`/`full_name` from **client-supplied** `raw_user_meta_data` — no validation that the invitee is entitled to that org/role.
- **Invites:** none. `auth.admin` / `inviteUserByEmail` / `generateLink` appear only in commented `supabase/config.toml:230-232` and research docs.
- **Security gap:** `chat-with-jamo/index.ts:85-97` reads `user_id`/`org_id` from the request **body** and never calls `auth.getUser()`; these drive all session reads/writes (`:117,135,239,278,310`) and RAG (`:143`). `salesforce-oauth-initiate/:33`, `salesforce-oauth-disconnect/:25`, and `retrieve-context/:161` share the body-trust pattern. Correct JWT-derivation exemplars exist in `analyze-proposal-gaps`, `generate-proposal-section`, `section-ai-action`.
- **Admin surface:** none — `src/App.tsx` has no `/admin` route; `scripts/` holds only RAG ingestion. Role-gating exists only for the Settings Templates tab (`src/pages/Settings.tsx:464`).
- **Email:** production SMTP is unconfigured — `supabase/config.toml` SMTP block is commented (`:220-227`); local uses inbucket. `[auth.email] enable_confirmations = false`. Local `enable_signup = true` diverges from the prod-disabled state.

This phase builds the org-creation flow, the invite chain (both tiers), the internal admin panel, production email, password reset, super_admin bootstrap, identity hardening, and the JWT security cleanup — then removes the dead signup code.

## Requirements

1. **Public signup permanently disabled**: Self-serve signup is off in production and the local config no longer diverges misleadingly.
   - Current: Prod signups disabled in the hosted dashboard; local `config.toml` has `enable_signup = true` (both places); dead client toggle in `Login.tsx`.
   - Target: `disable_signup`/`enable_signup=false` reflected in committed `supabase/config.toml`; no reachable code path creates a user via self-serve signup.
   - Acceptance: A POST to the Supabase signup endpoint (or attempting signup from any UI) is rejected; `supabase/config.toml` shows signup disabled.

2. **Internal admin panel (super_admin-only)**: A gated route lets the platform admin provision clients without DB access.
   - Current: No `/admin` route; no provisioning UI.
   - Target: A `/admin` route rendered only for `role === 'super_admin'`; non-super_admin users are redirected/blocked.
   - Acceptance: A super_admin can load `/admin`; an `admin` and a `user` are denied access (redirect or 403 state); unauthenticated users hit the login gate.

3. **Organization creation**: The admin panel creates a client org from name + plan.
   - Current: No org-creation code; orgs made by manual SQL.
   - Target: Admin panel form accepts org **name** and **plan** (trial/paid); `slug` is auto-generated from name with a uniqueness check; row inserted into `organizations` with defaults for `is_active`/`feature_flags`.
   - Acceptance: Submitting the form creates one `organizations` row with the given name, chosen plan, and a unique slug; a duplicate-name slug collision is resolved or rejected with a clear error.

4. **First-admin invitation**: The admin panel invites a client's first admin by email.
   - Current: No invite mechanism.
   - Target: Admin panel triggers a Supabase `auth.admin` email invite for a chosen org, with `role='admin'` and `org_id` set **server-side** (not client-supplied); invite email sent via production SMTP.
   - Acceptance: Inviting an email address produces a delivered invite email containing a working set-password link; the resulting user, after acceptance, has `role='admin'` and the correct `org_id`.

5. **Invite acceptance & initial password**: Invited users set their own password via the invite link.
   - Current: No acceptance flow.
   - Target: The invite link lands the user on a set-password page; on submit, the account is activated and the user is signed in to their org.
   - Acceptance: Following an invite link, setting a password, and submitting results in an authenticated session scoped to the correct org; the link cannot be reused after consumption.

6. **Org-admin teammate invites**: Org admins invite their own teammates in-app.
   - Current: No org-admin invite UI.
   - Target: An in-app surface (for `admin`/`super_admin` of an org) invites teammates by email with a selectable role (`admin`/`user`), `org_id` bound to the inviter's org server-side.
   - Acceptance: An org admin invites `user@example.com` as `user`; the invitee receives an invite, accepts, and appears in the same org with role `user`; the org admin cannot invite into a different org.

7. **Org-admin member management**: Org admins manage existing teammates.
   - Current: No member-management UI; role/status changes done by SQL.
   - Target: Org admin can deactivate/remove a teammate and change a teammate's role (`admin`/`user`) within their org.
   - Acceptance: An org admin deactivates a teammate (that user can no longer authenticate/access) and changes another teammate's role; both changes persist and are reflected on reload; neither action can target a user outside the org.

8. **Invite lifecycle management**: Pending invites are listable, resendable, and revocable.
   - Current: No pending-invite tracking.
   - Target: Both the admin panel and org-admin surface show pending invites with status, and support resend and revoke; invite-link expiry uses Supabase defaults.
   - Acceptance: A pending invite appears in the list; resend produces a new delivered email; revoke invalidates the invite so its link can no longer be used to create an account.

9. **Production email transport (Resend)**: Invites and password resets send via Resend in production.
   - Current: No production SMTP; SMTP block commented in `config.toml`.
   - Target: Supabase custom SMTP configured for Resend so invite and password-reset emails deliver from a verified sender in production.
   - Acceptance: A live invite and a live password-reset email both deliver to an external inbox from the configured Resend sender (not the Supabase default/inbucket).

10. **Password reset flow**: Onboarded users can reset a forgotten password.
    - Current: No forgot-password UI.
    - Target: A "forgot password" request page (enter email → reset email) and a set-new-password page reachable from the reset link.
    - Acceptance: Requesting a reset for a known user delivers a reset email; following the link and setting a new password lets the user sign in with the new password and not the old one.

11. **super_admin bootstrap**: The initial platform super_admin is provisioned reproducibly.
    - Current: No super_admin exists; admin panel would be unreachable (chicken-and-egg).
    - Target: A committed seed migration or script provisions the initial internal super_admin (and an internal org if required) so `/admin` is reachable on a fresh environment.
    - Acceptance: Running the seed against a clean database yields a user with `role='super_admin'` who can load `/admin`; the artifact is committed to the repo and idempotent (safe to re-run without error).

12. **Server-bound identity integrity**: An invitee cannot self-assign a different org or role.
    - Current: `handle_new_user()` trusts client-supplied `org_id`/`role` from `raw_user_meta_data` with no validation.
    - Target: `org_id` and `role` for an invited user are fixed by the invite server-side; the trigger/provisioning path does not honor invitee-supplied org/role overrides.
    - Acceptance: An invite issued for Org A + role `user`, when accepted with a tampered client payload attempting Org B / `admin`, still results in a profile in Org A with role `user`.

13. **chat-with-jamo JWT identity fix**: `chat-with-jamo` derives identity from the verified JWT.
    - Current: `chat-with-jamo/index.ts:85-97` reads `user_id`/`org_id` from the request body; `auth.getUser()` is never called.
    - Target: `user_id` (and `org_id`) are derived from the authenticated JWT via `auth.getUser()`; body-supplied identity is ignored for all session reads/writes and RAG scoping.
    - Acceptance: A request whose body carries a `user_id`/`org_id` different from its JWT is served using the JWT identity only (session rows and RAG are scoped to the JWT's user/org, never the body's).

14. **Body-trust cleanup (salesforce-oauth-*, retrieve-context)**: Remaining body-trusted identity paths derive org/identity from the JWT.
    - Current: `salesforce-oauth-initiate/:33`, `salesforce-oauth-disconnect/:25`, and `retrieve-context/:161` read `org_id`/`orgId` from the body.
    - Target: These functions derive `org_id` from the authenticated JWT (or otherwise validate it against the caller's org) rather than trusting the body.
    - Acceptance: For each of the three functions, a request with a mismatched body `org_id` operates on the JWT-derived org (or is rejected), not the body-supplied org.

15. **Remove dead self-serve signup code**: The unreachable signup path is deleted.
    - Current: `signUp()` in `AuthContext.tsx`, signup form JSX, and hardcoded Test Org A/B UUIDs remain in `Login.tsx`.
    - Target: The dead `signUp()` method, signup JSX, and hardcoded org UUIDs are removed; the login page offers only sign-in and "forgot password".
    - Acceptance: `signUp` no longer appears in `AuthContext`/`Login`; grep for the Test Org A/B UUIDs returns no hits in `src/`; the app builds and login still works.

## Boundaries

**In scope:**
- Committed Supabase auth config with signup disabled (no local/prod divergence)
- Internal super_admin-only admin panel (`/admin`) — create org, invite first admin, view/resend/revoke invites
- Organization creation (name + plan; auto slug with uniqueness)
- First-admin email invitation via `auth.admin`, org/role bound server-side
- Invite acceptance + set-initial-password flow
- Org-admin in-app teammate invites (role selectable: admin/user)
- Org-admin member management (deactivate/remove, change role) within their org
- Invite lifecycle: pending list, resend, revoke (default expiry)
- Production SMTP via Resend (invites + password resets)
- Password-reset flow (request + set-new-password pages)
- Reproducible super_admin bootstrap (seed migration/script)
- Server-bound identity integrity (invitee cannot self-assign org/role; `handle_new_user` hardened)
- JWT identity fix for `chat-with-jamo`
- Body-trust cleanup for `salesforce-oauth-initiate`, `salesforce-oauth-disconnect`, `retrieve-context`
- Removal of dead self-serve signup code + hardcoded Test Org UUIDs

**Out of scope:**
- Public/self-serve signup of any kind — permanently disabled; the whole point of the phase
- Billing / Stripe / plan enforcement — plan is stored but not metered/charged here (Milestone 2)
- SSO / SAML / social login — not needed for invite-only B2B onboarding in v1
- Multi-org membership (one user in multiple orgs) — data model stays one-profile-per-org
- Org deletion / offboarding / data export — not required to onboard; separate lifecycle work
- Custom-branded email templates beyond a functional sender — deliverability first; theming later
- Self-hosting / customer-managed deployments — hosted multi-tenant model only
- Audit logging of admin actions — valuable but not required for v1 provisioning

## Constraints

- **Hosted Supabase only**, project ref `fuuvdcvbliijffogjnwg` — multi-tenant single instance; RLS org-isolation (62 existing policies + helper functions) must remain intact.
- **Migrations:** `supabase db push` is diverged/unusable here — apply migrations via the Supabase Management API (`SUPABASE_ACCESS_TOKEN`) or Supabase MCP, and always commit a repo migration file too.
- **Edge functions must be deployed explicitly** — execute-phase commits but does not deploy; any changed/new edge function (chat-with-jamo, salesforce-oauth-*, retrieve-context, any new invite/provisioning function) must be deployed after code lands.
- **Roles are fixed:** `super_admin`, `admin`, `user` (existing enum/convention) — no new role tiers.
- **Email:** production transport is **Resend** via Supabase custom SMTP; invite-link/reset expiry uses Supabase defaults.
- **Identity:** all provisioning binds `org_id`/`role` server-side; no code path may trust client-supplied `org_id`/`role`/`user_id`.

## Acceptance Criteria

- [ ] Self-serve signup is rejected everywhere; committed `config.toml` shows signup disabled (no divergence).
- [ ] `/admin` loads for super_admin only; admin and user roles are denied.
- [ ] Admin panel creates an org (name + plan, unique auto slug) as one `organizations` row.
- [ ] Admin panel invites a first admin; a real invite email (via Resend) delivers a working set-password link.
- [ ] Accepting an invite sets a password and yields an authenticated session in the correct org; the link can't be reused.
- [ ] An org admin invites a teammate (role user/admin) into their own org and cannot target another org.
- [ ] An org admin can deactivate/remove a teammate and change a teammate's role within their org.
- [ ] Pending invites list shows status; resend re-delivers; revoke invalidates the link.
- [ ] A live password-reset email (via Resend) delivers and lets the user set a new password and sign in.
- [ ] Running the committed super_admin seed on a clean DB produces a super_admin who can reach `/admin`; re-running is safe (idempotent).
- [ ] An invite accepted with a tampered org/role payload still lands the user in the invited org with the invited role.
- [ ] `chat-with-jamo` uses JWT-derived `user_id`/`org_id`; a body with mismatched identity is served by JWT identity only.
- [ ] `salesforce-oauth-initiate`, `salesforce-oauth-disconnect`, and `retrieve-context` no longer trust body `org_id` (JWT-derived or rejected on mismatch).
- [ ] `signUp` and the Test Org A/B UUIDs no longer appear in `src/`; the app builds and login still works.
- [ ] All new/changed edge functions are deployed to the live project (verified deployed, not just committed).

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | Two-tier invite model + security cleanup, concrete outcome   |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Explicit in/out scope; forks resolved (self-serve, billing)  |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Migration/deploy gotchas, Resend, roles, RLS locked          |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 15 pass/fail criteria incl. tamper + deploy checks           |
| **Ambiguity**      | 0.13  | ≤0.20| ✓      |                                                              |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective     | Question summary                          | Decision locked                                              |
|-------|-----------------|-------------------------------------------|-------------------------------------------------------------|
| 1     | Researcher/Bound | Invite depth in v1?                       | Two tiers — we provision org + first admin; org admin invites teammates |
| 1     | Boundary Keeper | Provisioning surface?                      | Internal super_admin-only admin panel (UI)                  |
| 1     | Constraint      | Production email provider?                 | Resend (custom SMTP)                                         |
| 1     | Boundary Keeper | Security-cleanup scope?                     | chat-with-jamo + salesforce-oauth-* + retrieve-context      |
| 2     | Boundary Keeper | Org-admin powers over teammates?           | Invite + manage (deactivate/remove + role change)           |
| 2     | Failure Analyst | Invite-lifecycle management?               | Full lifecycle (pending list, resend, revoke)               |
| 2     | Boundary Keeper | Ship password reset this phase?            | Yes — include forgot-password flow                          |
| 2     | Boundary Keeper | Remove dead signup code?                   | Yes — delete signUp() + signup JSX + Test Org UUIDs         |
| 3     | Seed Closer     | super_admin bootstrap?                      | Committed seed migration/script (idempotent)                |
| 3     | Seed Closer     | Org-creation inputs?                        | Name + plan; slug auto-generated with uniqueness            |
| 3     | Seed Closer     | Server-bind org/role on invite?             | Yes — invitee cannot self-assign org/role (harden trigger)  |
| 3     | Seed Closer     | Invite-link expiry?                         | Supabase default (resend covers expired links)              |

---

*Phase: 15-client-onboarding-provisioning*
*Spec created: 2026-07-03*
*Next step: /gsd-discuss-phase 15 — implementation decisions (how to build what's specified above)*
