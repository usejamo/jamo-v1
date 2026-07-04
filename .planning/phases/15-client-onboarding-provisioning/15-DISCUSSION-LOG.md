# Phase 15: Client Onboarding & Provisioning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 15-client-onboarding-provisioning
**Areas discussed:** Invite mechanism & lifecycle, Identity binding, Email transport, super_admin bootstrap, Cross-org access, Admin surfaces
**Note:** SPEC.md (15 requirements) was locked first via /gsd-spec-phase — this discussion covered HOW to implement, not WHAT.

---

## Invite Lifecycle Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated invites table | Source of truth for lifecycle/audit/binding; auth.admin still sends email | ✓ |
| Native auth state only | Derive from auth.users; thin revoke/listing/audit | |

**User's choice:** Dedicated `invites` table — with explicit status enum, RLS-scoped visibility, role-capped creation, acceptance reads binding solely from the record. One migration serving three locked requirements vs building lifecycle awkwardly on native state.

---

## Identity Binding (org/role, anti-self-assign)

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger reads invites table | handle_new_user reads org/role from pending invite by email; atomic; no mirror | ✓ |
| app_metadata + hardened trigger | Trigger reads server-only app_metadata | |
| Server-side profile creation | Edge function creates profile from invites row | |

**User's choice:** Trigger-reads-invites ("third shape" the user proposed).
**Notes:** Resolved via clarification dialogue. Key facts established: (1) `handle_new_user` fires `AFTER INSERT` at invite-SEND time (acceptance is an UPDATE), not acceptance; (2) it is SECURITY DEFINER and can read the invites table; (3) app_metadata is drift-prone (inviteUserByEmail doesn't set it; post-hoc update lands after the trigger); (4) edge-function-creates-profile reintroduces a half-provisioned window. Trigger-reads-invites keeps atomicity + sole source + no mirror. Ordering: insert invites row (commit) before auth.admin create.

---

## Trigger No-Match Behavior (elevated to requirements)

| Option | Description | Selected |
|--------|-------------|----------|
| Single-path trigger, RAISE on no-match | No no-invite branch; hard fail = security invariant | ✓ |
| Defined no-invite default branch (Approach B) | Trigger creates default/placeholder profile | |

**User's choice:** Single-path trigger.
**Notes:** Established that in v1 the bootstrap is the ONLY non-invite insert (self-serve signup disabled; password reset is an UPDATE; SSO is future). So no no-invite branch is needed. Elevated to requirements: (1) trigger RAISEs clear message on no-match; (2) "no auth user without a pending invite" guardrail documented as intentional.

---

## Email Transport

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase custom SMTP via Resend | Native invite/recovery flows, Resend relay, light branding | ✓ |
| Resend API custom-branded emails | Fully branded from edge function; manage links/tokens | |

**User's choice:** Supabase custom SMTP via Resend (v1).
**Notes:** Keeps the native-invite-fires-trigger flow the identity binding depends on. Ops: verify domain SPF/DKIM/DMARC, brand templates, raise rate limit for invite bursts. Custom Resend-API email is a later-phase upgrade gated on preserving the trigger flow.

---

## super_admin Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-API script (Approach A) | Service-role script: internal org → pending invite → createUser → flip accepted | ✓ |
| SQL seed migration | Hand-write auth.users rows; fragile | |
| Supabase Management API | One-off; not a committed artifact | |

**User's choice:** Admin-API script, Approach A (bootstrap goes through the normal invites-row path).
**Notes:** Resolved via clarification — Approach A keeps the trigger single-path (no special branch); bootstrap is "just another invite-first flow." Sequencing (pending-at-createUser, flip-to-accepted-after) must be explicit + tested; password env-sourced; skip if super_admin exists; internal org (jamo-internal) as home so org_id NOT NULL holds.

---

## Cross-Org Access (platform admin administering client orgs)

| Option | Description | Selected |
|--------|-------------|----------|
| Service-role edge functions | All cross-org provisioning + reads via narrow service-role functions | ✓ |
| super_admin cross-org RLS policies | Add per-table super_admin bypass | |
| Hybrid | Writes via edge fns; narrow read policies on invites/orgs | |

**User's choice:** Service-role edge functions for all cross-org provisioning + reads.
**Notes:** Verified finding — only `organizations` has a super_admin RLS bypass; all other tables scope by `get_user_org_id()` (caller's home org), so a super_admin in jamo-internal can't see client-org data via direct RLS. Resolution: narrowly-scoped operation-specific service-role edge functions, in-function super_admin authz from the JWT (not panel-implied), super_admin RLS bypass stays limited to `organizations`. Also flagged: verify `orgs_super_admin` covers INSERT (WITH CHECK) — moot since create-org goes through an edge function.

---

## Admin Surfaces (shape/placement)

| Option | Description | Selected |
|--------|-------------|----------|
| Platform panel: dedicated /admin route | Route-gated UX + edge-function JWT enforcement; minimal v1 | ✓ |
| Platform panel: section in Settings | Super_admin tab in Settings | |
| Team mgmt: new Team tab in Settings | Reuse role-gated tab pattern (like Templates) | ✓ |
| Team mgmt: dedicated /team page | Standalone route + nav | |

**User's choice:** Dedicated `/admin` route tree for the platform panel; new "Team" tab in Settings for org-admin teammate management.
**Notes:** /admin route-gated to super_admin (UX) with service-role edge functions enforcing super_admin from the JWT as the real control; v1 minimal (org list, create-org, invite first admin, pending-invites resend/revoke). Team tab reuses the Settings role-gated pattern (Settings.tsx:464), UI-gated to org admins + server-side org-scoped/role-capped enforcement, teammate invites via the shared invite mechanism.

## Claude's Discretion

- Password-reset flow UI (standard resetPasswordForEmail + updateUser, reuse Login styling)
- Exact invites.status enum values (+ optional `expired`)
- Shared JWT-auth helper module for edge functions
- Mechanics of dead-code removal (SPEC req 15)

## Deferred Ideas

- Custom-branded Resend-API emails (later phase)
- SSO / OAuth provisioning path (future; needs its own trigger/provisioning branch)
- Billing / plan enforcement (Milestone 2)
- Org deletion / offboarding, admin-action audit logging, multi-org membership
