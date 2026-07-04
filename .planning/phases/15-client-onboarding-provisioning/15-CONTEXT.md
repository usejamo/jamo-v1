# Phase 15: Client Onboarding & Provisioning - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Invite-based, sales-led provisioning that replaces the dead self-serve demo signup. A platform super_admin creates client organizations and invites each org's first admin by email; that org admin sets their own password and can then invite and manage their own teammates. Includes production email (Resend), a reproducible super_admin bootstrap, server-bound identity integrity, and the JWT identity-trust security cleanup. Hosted multi-tenant model only.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**15 requirements are locked.** See `15-SPEC.md` for full requirements, boundaries, and acceptance criteria. Downstream agents MUST read `15-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
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
- Removal of dead self-serve signup code + hardcoded Test Org UUIDs

**Out of scope (from SPEC.md):**
- Edge-function JWT identity cleanup (`chat-with-jamo`, `salesforce-oauth-*`, `retrieve-context`) — split into **Phase 14.3** (prerequisite go-live gate)
- Public/self-serve signup of any kind (permanently disabled)
- Billing / Stripe / plan enforcement (Milestone 2)
- SSO / SAML / social login
- Multi-org membership (one profile per org)
- Org deletion / offboarding / data export
- Custom-branded email templates beyond a functional sender
- Self-hosting
- Audit logging of admin actions

</spec_lock>

<decisions>
## Implementation Decisions

### Invite Mechanism & Lifecycle
- **D-01 — Dedicated `invites` table as single source of truth.** A small `invites` table (email, org_id, role, invited_by, status enum, timestamps) is the authoritative record for lifecycle (pending/resend/revoke), audit, and server-bound org/role binding. RLS-scoped visibility, role-capped creation (org admins cannot mint super_admin/admin beyond their cap), and acceptance reads the org/role binding **solely from this record**. `auth.admin` + SMTP still sends the email and creates the `auth.users` row. One migration serves three locked requirements (invite lifecycle, org-admin invites, identity integrity) at once.
- **D-02 — Identity binding = trigger-reads-invites (the chosen "third shape").** Keep `handle_new_user` (SECURITY DEFINER, `AFTER INSERT ON auth.users`, runs in the auth-insert's transaction = atomic) but rewrite it to `SELECT org_id, role FROM invites WHERE lower(email)=lower(NEW.email) AND status='pending'` and insert `user_profiles` from that. **No `app_metadata` mirror** — the invites table is the sole source, zero drift, no second copy to sync. Rejected: app_metadata (inviteUserByEmail doesn't set it; post-hoc `updateUserById` lands after the AFTER-INSERT trigger → drift-prone) and edge-function-creates-profile (decouples from the atomic auth insert → half-provisioned-user window).
- **D-03 — Trigger fires at invite-SEND time, so ordering is fixed.** The `auth.users` row is inserted when the invite is *sent* (`auth.admin`), not at acceptance (acceptance is an UPDATE setting password + `confirmed_at`). Therefore the provisioning edge function MUST: (1) `INSERT` the `invites` row (committed) → (2) call `auth.admin` to create the user + send email → trigger fires, finds the committed row, binds atomically. `user_profiles` exists pre-acceptance (harmless — login blocked until `confirmed_at` is set).
- **D-04 — Single-path trigger; RAISE on no-match. [Elevated to requirement]** No no-invite branch. On no matching pending invite the trigger `RAISE`s a clear exception (e.g. `'no pending invite for %'`), which rolls back the auth insert. Better than relying on the bare NOT NULL violation.
- **D-05 — "No auth user without a pending invite" guardrail is intentional. [Elevated to requirement]** A consequence of D-04: you cannot create an auth user (even via the Supabase dashboard) without first inserting a pending `invites` row. This is a DB-layer security invariant, documented as deliberate. A future SSO phase would add its own provisioning path.
- **D-06 — Revoke/modify-before-acceptance policy.** Revoke = `auth.admin.deleteUser` (FK-cascades the profile) + mark the `invites` row `revoked`. Changes = re-issue (no in-place role edit of a pending invite), so two authoritative role values are never live at once.

### Identity & Security Cleanup
- **D-07 — Edge-function JWT identity cleanup is Phase 14.3 (prerequisite gate), NOT this phase.** The `chat-with-jamo` / `salesforce-oauth-*` / `retrieve-context` JWT derivation was split into **Phase 14.3 (Edge Identity Hardening)** as an independent deployable unit that ships and deploys first. Phase 15 retains only the invite-coupled identity work: server-bound org/role via the hardened `handle_new_user` trigger (see D-02, SPEC req 12). Phase 14.3 must be deployed + verified before real tenants are provisioned. See `.planning/phases/14.3-edge-identity-hardening/14.3-SPEC.md`.
- **D-08 — Cross-org access = service-role edge functions only.** All cross-org provisioning **and reads** (create org, invite first admin, list/resend/revoke invites per client org) run through **narrowly-scoped, operation-specific** service-role edge functions that bypass RLS. In-function authorization asserts `super_admin` **from the JWT** (not implied by the panel). super_admin RLS bypass stays limited to the `organizations` table only — **no** new per-table super_admin bypass policies (would smear the trust boundary). Cross-org capability stays an auditable, enumerable set of functions. NOT a generic cross-org query proxy.

### Email
- **D-09 — Supabase custom SMTP via Resend (v1).** Configure Supabase custom SMTP with Resend as relay; use Supabase's native invite/recovery email + link flows, lightly branded via the template editor. This pairs with D-02/D-03: the native invite still creates the `auth.users` row that fires the trigger. Ops checklist: verify sender domain (SPF/DKIM/DMARC), brand templates enough to look legitimate, raise the rate limit to survive an invite burst. Custom-branded Resend-API email is a **later-phase upgrade**, gated on preserving the trigger-firing flow.

### Admin Surfaces
- **D-10 — Platform super_admin panel = dedicated `/admin` route tree.** Gated to super_admin at the route (UX) with the service-role edge functions behind it enforcing super_admin from the JWT (the real control). Keeps platform-ops separated from the tenant-facing Settings surface; makes the trust boundary auditable as one route tree. v1 minimal: org list, create-org, invite first admin, pending-invites with resend/revoke.
- **D-11 — Org-admin teammate management = new "Team" tab in Settings.** Reuses the existing role-gated tab pattern (like the Templates tab at `Settings.tsx:464`). UI-gated to org admins + server-side enforcement that operations are org-scoped to the caller and role-capped. Teammate invites flow through the same shared invite mechanism (D-01) as every other invite.

### super_admin Bootstrap
- **D-12 — Approach A: committed admin-API script (service role).** Idempotent Deno/Node script: upsert internal org (e.g. slug `jamo-internal`, FK home for super_admin so `user_profiles.org_id NOT NULL` holds) → insert a **pending** bootstrap `invites` row (role `super_admin`) → `auth.admin.createUser({ email, password, email_confirm: true })` (trigger binds via the single D-02 path) → flip the invites row to `accepted`. Skip if a super_admin already exists. Password env-sourced. Uses the same invite-first flow as everything else — no special trigger branch. Rejected: SQL seed migration (can't call `auth.admin` from SQL; hand-writing `auth.users` rows is fragile) and Management API (not a committed reproducible artifact).

### Claude's Discretion
- Password-reset flow UI — standard `resetPasswordForEmail` + `updateUser`, reuse Login styling.
- Exact `invites.status` enum values (pending/accepted/revoked; add `expired` if useful).
- Whether to build a shared JWT-auth helper module for edge functions (D-07).
- Mechanics of dead-code removal (SPEC req 15).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements
- `.planning/phases/15-client-onboarding-provisioning/15-SPEC.md` — Locked requirements, boundaries, acceptance criteria. Read first.

### Auth / RLS / identity (the seam this phase modifies)
- `supabase/migrations/20260305000013_rls_policies.sql` §82-98 — `handle_new_user` trigger to rewrite (D-02/D-03/D-04); §17-19 — `orgs_super_admin` policy (only cross-org bypass that exists); org-scoped policies elsewhere
- `supabase/migrations/20260305000012_rls_helper_functions.sql` — `private.get_user_org_id()`, `private.get_user_role()` (returns caller's HOME org — key to D-08)
- `supabase/migrations/20260305000002_organizations.sql` — `organizations` schema (name, slug UNIQUE, plan, is_active, feature_flags); no `domain` column
- `supabase/migrations/20260305000003_user_profiles.sql` — `user_profiles` schema; roles `super_admin`/`admin`/`user`; `org_id NOT NULL`

### Edge-function JWT cleanup — moved to Phase 14.3 (prerequisite gate)
- `.planning/phases/14.3-edge-identity-hardening/14.3-SPEC.md` — the split-out JWT identity hardening (chat-with-jamo, salesforce-oauth-*, retrieve-context). Deploy + verify before provisioning real tenants.
- `.planning/phases/14.3-edge-identity-hardening/14.3-CONTEXT.md` — decisions incl. the retrieve-context internal-caller caveat.

### Frontend integration
- `src/context/AuthContext.tsx` §76-83 — `signUp()` to remove (SPEC req 15)
- `src/pages/Login.tsx` §12-18,112-146 — dead signup toggle/JSX + hardcoded Test Org A/B UUIDs to remove
- `src/pages/Settings.tsx` §464 — role-gated tab pattern to reuse for the Team tab (D-11)
- `src/App.tsx` — routing (ProtectedRoute + Outlet); add `/admin` route tree (D-10)

### Config
- `supabase/config.toml` §169,204 (`enable_signup`), §209 (`enable_confirmations`), §220-227 (commented SMTP) — align signup-disabled + wire Resend SMTP (D-09)

### Ops constraints (from STATE.md memory / project conventions)
- Migrations: `supabase db push` is diverged here — apply via Supabase Management API (`SUPABASE_ACCESS_TOKEN`) or Supabase MCP, AND commit a repo migration file.
- Edge functions must be **deployed explicitly** (execute-phase commits but does not deploy) — SPEC acceptance criterion checks deployment, not just commit.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Settings role-gated tab pattern** (`Settings.tsx:464`) — direct analog for the org-admin Team tab (D-11).
- **Edge-function service-role pattern** — existing functions already use the service role to write DB; the provisioning/cross-org functions (D-08) follow the same shape.
- **JWT-derivation exemplars** — `analyze-proposal-gaps`, `generate-proposal-section`, `section-ai-action` already do `auth.getUser()` correctly; copy for D-07.
- **ProtectedRoute + Outlet routing** (`App.tsx`) — extend for the `/admin` route tree (D-10).
- **`handle_new_user` trigger** — exists and is atomic; rewrite in place rather than replace (D-02).

### Established Patterns
- RLS org isolation via `private.get_user_org_id()` / `private.get_user_role()`; every table except `organizations` is scoped to the caller's home org with no super_admin bypass (drives D-08).
- Roles fixed at `super_admin`/`admin`/`user`.
- Migrations via Management API/MCP + repo file; edge functions deployed explicitly.

### Integration Points
- New `invites` table + RLS + rewritten `handle_new_user` trigger.
- New provisioning/cross-org service-role edge functions (create-org, invite, invite-lifecycle).
- `/admin` route tree in `App.tsx`; Team tab in `Settings.tsx`.
- Supabase custom SMTP (Resend) config; password-reset pages.
- Bootstrap admin-API script.

</code_context>

<specifics>
## Specific Ideas

- **Trigger-reads-invites** is the load-bearing design choice — verify in research that (a) `handle_new_user` fires `AFTER INSERT` at invite-send time and (b) SECURITY DEFINER can read the `invites` table. High confidence, but confirm before building.
- **Approach A bootstrap sequencing** must be explicit and tested: invites row **pending** at `createUser` time, flipped to **accepted** after (the trigger filters `status='pending'`, so a pre-accepted row won't match).
- **Resend SMTP ops:** SPF/DKIM/DMARC on the sender domain, branded templates, raised rate limit for invite bursts.
- Cross-org edge functions are **operation-specific**, not a generic query proxy.

</specifics>

<deferred>
## Deferred Ideas

- **Custom-branded Resend-API emails** — later phase; must preserve the native-invite-fires-trigger flow (D-09).
- **SSO / OAuth provisioning** — future phase; will need its own trigger/provisioning branch (the D-04/D-05 guardrail assumes invite-only inserts in v1).
- **Billing / plan enforcement** — Milestone 2 (plan is stored, not metered).
- **Org deletion / offboarding, admin-action audit logging, multi-org membership** — out of scope per SPEC; noted so future phases know they were considered.

None of these are acted on in Phase 15.

</deferred>

---

*Phase: 15-client-onboarding-provisioning*
*Context gathered: 2026-07-03*
*Next step: /gsd-plan-phase 15 — implementation planning (how to build what's specified above)*
