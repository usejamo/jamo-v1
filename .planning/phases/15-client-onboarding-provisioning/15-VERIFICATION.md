---
phase: 15-client-onboarding-provisioning
verified: 2026-07-14T01:30:00Z
status: human_needed
score: 13/13 must-haves verified (code-side); 5 items require live human verification
overrides_applied: 0
human_verification:
  - test: "Live invite email delivery (Resend)"
    expected: "A super_admin invites a first admin (or an org admin invites a teammate); the invite email arrives from the configured Resend sender (not inbucket/default) with a working set-password link"
    why_human: "Requires completed Resend account + DNS SPF/DKIM/DMARC verification + hosted-dashboard SMTP config (15-02 checkpoint intentionally deferred per user decision) — cannot be asserted from static code"
  - test: "Live password-reset email delivery"
    expected: "Requesting a reset for a known user delivers an email from the Resend sender; following the link lets the user set a new password and sign in with it (not the old one)"
    why_human: "Same Resend/DNS/dashboard dependency as above"
  - test: "req-12 tamper-proofing live DB check"
    expected: "An invite issued for Org A / role 'user', when accepted via a tampered client payload requesting Org B / 'admin', still lands the profile in Org A with role 'user' (verify script: supabase/migrations/verify/15-12-tamper.sql)"
    why_human: "Requires executing a hostile payload against the live hosted DB — code-level trigger inspection confirms org/role are read exclusively from the invites table (no raw_user_meta_data branch), but the live adversarial run itself was not confirmed executed in any SUMMARY"
  - test: "AdminPanel end-to-end click-through"
    expected: "A signed-in super_admin creates an org, sees live slug preview, invites a first admin, and sees resend/revoke work against the pending-invites list"
    why_human: "15-09's checkpoint:human-verify gate was explicitly left open per orchestrator instruction; code is build-clean and grep-verified but never visually exercised"
  - test: "Settings > Team tab end-to-end click-through"
    expected: "An org admin invites a teammate, the teammate accepts, appears in the member list, admin changes their role and deactivates/reactivates them — all scoped to one org"
    why_human: "15-10's checkpoint:human-verify gate was explicitly left open per orchestrator instruction"
---

# Phase 15: Client Onboarding & Provisioning Verification Report

**Phase Goal:** Replace the interim demo signup with a sales-led, invite-only provisioning flow. Public signup permanently disabled; an admin (super_admin) provisions each client org and invites the client's first admin by email via Supabase auth.admin invite; the invitee follows the link and sets their own password. That org admin can then invite their own teammates (roles: super_admin/admin/user). Includes org-creation flow, production SMTP/email config, and a lightweight internal admin surface. Server-bound identity integrity (invitee cannot self-assign org/role) is in scope.

**Verified:** 2026-07-14
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped 1:1 to 15-SPEC.md requirements 1-13)

| # | Truth (SPEC req) | Status | Evidence |
|---|---|---|---|
| 1 | Public signup permanently disabled, config committed, no local/prod divergence | VERIFIED | `supabase/config.toml`: `enable_signup = false` at both `[auth]` (line 177) and `[auth.email]` (line 212); `signUp` fully removed from `AuthContext.tsx`/`Login.tsx` (grep for `signUp` in `src/` = 0 hits); `src/__tests__/config-signup-disabled.test.ts` (5 assertions) passes |
| 2 | `/admin` gated to super_admin only | VERIFIED | `src/components/SuperAdminRoute.tsx` redirects non-super_admin to `/`; wired in `App.tsx` nested inside `ProtectedRoute` around `/admin` → `AdminPanel`; `SuperAdminRoute.test.tsx` (5 tests: loading/allow/deny×3) passes |
| 3 | Org creation from name+plan, unique auto-slug | VERIFIED | `supabase/functions/admin-create-org/index.ts`: super_admin JWT gate, `plan IN ('trial','paid')` validation, insert-catch-23505-retry loop (bounded 6 attempts) for slug uniqueness; `src/lib/slug.ts` `baseSlug` unit-tested (7 Vitest cases, all passing) |
| 4 | First-admin invite, org/role server-bound | VERIFIED (code) | `admin-invite-first-admin/index.ts`: `role` never destructured from body (hardcoded `'admin'`), `targetOrgId` intentionally client-supplied (cross-org op) but gated behind a super_admin JWT-derived assertion; live email delivery is human-verify (Resend pending) |
| 5 | Invite acceptance sets password, yields authed session, link not reusable | VERIFIED (code) | `src/pages/AcceptInvite.tsx`: session-existence check via `getSession()`, `updateUser({password})` on submit; routed at `/accept-invite` (public, outside ProtectedRoute); live link click-through is human-verify |
| 6 | Org-admin invites teammate (admin/user), own org only | VERIFIED | `team-invite/index.ts`: caller-role gate (admin/super_admin), `role==='super_admin'` rejected 403, body `org_id` mismatch rejected 403, invite always bound to `callerOrgId` |
| 7 | Org-admin manages teammates (deactivate/remove, role change), own org only | VERIFIED | `team-manage/index.ts`: pre-write target org_id check (403 on mismatch), super_admin target rejected 403, `change_role`/`deactivate`/`reactivate` implemented; deactivate uses real `ban_duration` (auth-layer block) + `is_active` mirror |
| 8 | Pending invites listable/resendable/revocable (both surfaces) | VERIFIED | `admin-invites-lifecycle/index.ts` (cross-org: list/resend/revoke, resend=revoke-then-reissue); `team-invite/index.ts` also carries same-org `resend`/`revoke` actions (added in plan 10) for the Team tab's own pending-invites sub-list |
| 9 | Production email transport (Resend) configured | VERIFIED (code) / PENDING (live) | `config.toml` `[auth.email.smtp]`: host `smtp.resend.com:465`, `pass = "env(RESEND_SMTP_PASSWORD)"` (no literal secret); hosted-dashboard SMTP/DNS/Resend-account steps explicitly deferred by user decision — flagged as human-verification debt, not a code gap |
| 10 | Password reset flow (request + set-new-password) | VERIFIED (code) | `src/pages/ForgotPassword.tsx` (`resetPasswordForEmail`, enumeration-safe static confirmation copy) + `src/pages/ResetPassword.tsx` (`updateUser({password})`); both routed publicly; `ResetPassword.test.tsx` (3 tests) passes; live delivery human-verify |
| 11 | super_admin bootstrap, reproducible + idempotent | VERIFIED | `scripts/bootstrap-super-admin.ts`: idempotency guard (`role='super_admin'` existence check), invite-first sequence (upsert org → pending invite → createUser → flip accepted); `bootstrap-super-admin.test.ts` (2/2 passing); **live-run confirmed** per orchestrator ground truth (`super_admins=1`, email `aarondswoodbury@gmail.com`, org `jamo-internal`, `is_active=true`, invite `status=accepted`) |
| 12 | Server-bound identity integrity — invitee cannot self-assign org/role | VERIFIED (code) / PENDING (live adversarial test) | Migration's `handle_new_user()` reads org/role exclusively from `invites` table by email+status='pending', `RAISE EXCEPTION` on no match — zero `raw_user_meta_data->>'org_id'`/`role` references; migration confirmed applied live per ground truth. The adversarial tamper test itself (`supabase/migrations/verify/15-12-tamper.sql`) exists but no SUMMARY documents it having been *run* — flagged as human-verify |
| 13 | Dead self-serve signup code removed | VERIFIED | `grep -rn "signUp" src/` = 0 hits; Test Org A/B UUID (`00000000-0000-0000-0000-000000000001/2`) absent from `Login.tsx`/signup paths (one unrelated coincidental match in `ProposalCreationWizard.tsx:220` is a template-ID fallback, not an org identifier — documented, out of scope); `npm run build` clean; full test suite green (382 passed, 16 skipped) |

**Score:** 13/13 truths have passing code-side evidence. 5 of them (4, 5, 9, 10, 12's adversarial run) also carry a live/manual-verification component that is not yet confirmed — these are surfaced as human-verification items below, not gaps.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/20260713000002_invites_and_trigger_hardening.sql` | invites table, RLS, is_active col, hardened trigger | VERIFIED | Read in full — matches SUMMARY claims exactly; applied live per ground truth |
| `supabase/migrations/verify/15-12-tamper.sql` | req-12 manual tamper checklist | VERIFIED (exists) | Present; execution against live DB not confirmed (human-verify) |
| `supabase/config.toml` | signup disabled, Resend SMTP, redirects, rate limit | VERIFIED | All 4 elements present and correct |
| `supabase/functions/_shared/invites.ts` | createInvite/revokeInvite/findAuthUserIdByEmail | VERIFIED | D-03 insert-then-invite-then-compensate sequence confirmed |
| `supabase/functions/_shared/auth.ts` | getAuthedUserAndOrg JWT-identity pattern | VERIFIED | Two-client derivation (anon-verify + service-role org lookup), fails closed on null org |
| `supabase/functions/admin-create-org/index.ts` | super_admin org creation, unique slug | VERIFIED | Deployed (per ground truth), deno.json import map present |
| `supabase/functions/admin-invite-first-admin/index.ts` | cross-org first-admin invite, role server-fixed | VERIFIED | Deployed, deno.json present |
| `supabase/functions/admin-invites-lifecycle/index.ts` | list/resend/revoke, cross-org | VERIFIED | Deployed, deno.json present |
| `supabase/functions/team-invite/index.ts` | same-org invite + resend/revoke | VERIFIED | Deployed (re-deployed after wave-5 edits per ground truth) |
| `supabase/functions/team-manage/index.ts` | change_role/deactivate/reactivate/list_members | VERIFIED | Deployed (re-deployed after wave-5 edits) |
| `scripts/bootstrap-super-admin.ts` | idempotent super_admin seed | VERIFIED | Live-run confirmed per ground truth |
| `src/pages/AcceptInvite.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx` | auth flow pages | VERIFIED | All exist, wired, tested (ResetPassword), no stub markers |
| `src/pages/admin/AdminPanel.tsx` | platform admin surface | VERIFIED | Exists, build-clean, all writes route through `functions.invoke('admin-*')` |
| `src/components/SuperAdminRoute.tsx` | role guard | VERIFIED | Exists, tested, wired |
| `src/components/settings/TeamTab.tsx` | org-admin team management | VERIFIED | Exists, wired into `Settings.tsx` gated to admin/super_admin |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `App.tsx` | `AdminPanel.tsx` | `<Route path="/admin">` nested in `ProtectedRoute` → `SuperAdminRoute` | WIRED | Confirmed by direct read of `App.tsx` lines 32-61 |
| `App.tsx` | `AcceptInvite`/`ForgotPassword`/`ResetPassword` | public `<Route>` siblings of `/login` | WIRED | Confirmed, outside `ProtectedRoute` |
| `AdminPanel.tsx` | `admin-create-org`/`admin-invite-first-admin`/`admin-invites-lifecycle` | `supabase.functions.invoke(...)` | WIRED | 5 invoke call-sites found via grep |
| `TeamTab.tsx` | `team-invite`/`team-manage` | `supabase.functions.invoke(...)` | WIRED | 7 invoke call-sites found via grep |
| `Settings.tsx` | `TeamTab.tsx` | `'Team'` sub-tab, `isOrgAdmin` gate | WIRED | Confirmed lines 465-530 |
| `handle_new_user()` trigger | `invites` table | `SELECT org_id, role FROM invites WHERE ... status='pending'` | WIRED (live) | Migration text confirmed + orchestrator ground truth confirms live DB state matches |
| Edge functions | live hosted project | deployed via `supabase functions deploy` | WIRED (live) | Ground truth: all 5 functions ACTIVE, re-deployed post-wave-5, deno.json import maps present in all 5 dirs (confirmed by direct read) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite green | `npm run test:run` | 382 passed, 16 skipped, 58 files passed / 2 skipped | PASS |
| Build clean | `npm run build` | 664 modules transformed, no TS errors | PASS |
| Phase-15-specific unit tests | `npm run test:run -- SuperAdminRoute ResetPassword slug config-signup-disabled bootstrap-super-admin` | 22/22 passed across 5 files | PASS |
| Live edge function / email behavior | N/A | Not run (would require live server calls / external inbox) | SKIP — routed to human verification |

### Requirements Coverage (15-SPEC.md reqs 1-13)

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| 1 | 15-02, 15-11 | Signup disabled, no divergence | SATISFIED | config.toml + dead code removal confirmed |
| 2 | 15-11 (route) / 15-09 (page) | `/admin` super_admin-gated | SATISFIED | SuperAdminRoute + route wiring confirmed |
| 3 | 15-04 | Org creation, unique slug | SATISFIED | admin-create-org confirmed |
| 4 | 15-04 | First-admin invite, server-bound | SATISFIED (code) / NEEDS HUMAN (live delivery) | admin-invite-first-admin confirmed; Resend pending |
| 5 | 15-03, 15-11 | Invite acceptance + password | SATISFIED (code) / NEEDS HUMAN (live link) | AcceptInvite.tsx confirmed |
| 6 | 15-06 | Org-admin teammate invite, own-org | SATISFIED | team-invite confirmed |
| 7 | 15-06 | Org-admin member management | SATISFIED | team-manage confirmed |
| 8 | 15-05, 15-10 | Invite lifecycle (list/resend/revoke) | SATISFIED | admin-invites-lifecycle + team-invite resend/revoke confirmed |
| 9 | 15-02 | Production Resend SMTP | SATISFIED (code) / NEEDS HUMAN (Resend/DNS/dashboard) | config.toml wired; human checkpoint deferred by explicit user decision |
| 10 | 15-03, 15-11 | Password reset flow | SATISFIED (code) / NEEDS HUMAN (live delivery) | ForgotPassword/ResetPassword confirmed |
| 11 | 15-07 | super_admin bootstrap | SATISFIED | Script + live run confirmed via orchestrator ground truth |
| 12 | 15-01 | Server-bound identity integrity | SATISFIED (code) / NEEDS HUMAN (live adversarial run) | Trigger + all edge functions confirmed to derive org/role server-side only |
| 13 | 15-11 | Dead signup code removed | SATISFIED | grep-clean, build clean, tests green |

No orphaned requirements — all 13 SPEC requirements are claimed by at least one plan and have corresponding code evidence.

### Anti-Patterns Found

None blocking. Grep sweep of `AdminPanel.tsx`/`TeamTab.tsx` for TODO/FIXME/PLACEHOLDER/"not implemented" found only legitimate HTML `placeholder=` input attributes (e.g. `placeholder="admin@company.com"`), not stub markers. No empty handlers, no hardcoded empty-array returns feeding rendered lists (all list state is populated from `functions.invoke(...)` responses).

### Human Verification Required

### 1. Live invite email delivery (Resend)
**Test:** Provision a test org via `/admin`, invite a first admin (or, as an org admin, invite a teammate via Settings > Team), and check the recipient inbox.
**Expected:** A real invite email arrives from the configured Resend sender (not Supabase's default/inbucket), containing a working set-password link that lands on `/accept-invite`.
**Why human:** Requires a completed Resend account, verified sending domain (SPF/DKIM/DMARC), and hosted-dashboard SMTP configuration — explicitly deferred by user decision at the 15-02 checkpoint. Code-side wiring is complete and test-guarded.

### 2. Live password-reset email delivery
**Test:** From `/forgot-password`, request a reset for a known account; check the inbox, follow the link, set a new password.
**Expected:** Reset email delivers from the Resend sender; the new password works and the old one does not.
**Why human:** Same Resend/DNS/dashboard dependency as above.

### 3. req-12 adversarial tamper test (live DB)
**Test:** Issue an invite for Org A / role `user`; accept it with a client payload that attempts to claim Org B / role `admin` (per `supabase/migrations/verify/15-12-tamper.sql`).
**Expected:** The resulting profile is still in Org A with role `user` — the tampered payload has no effect.
**Why human:** Requires executing a hostile payload against the live hosted DB. Code inspection strongly supports this (trigger reads org/role exclusively from `invites`, ignores `raw_user_meta_data`), but no SUMMARY documents the adversarial script actually having been executed against the live database.

### 4. AdminPanel end-to-end click-through
**Test:** As a signed-in super_admin, load `/admin`, create an org (observe live slug preview and duplicate-name handling), invite a first admin, and exercise resend/revoke on the pending-invites list.
**Expected:** All actions succeed and reflect correctly in the UI.
**Why human:** 15-09's `checkpoint:human-verify` gate was explicitly left open per orchestrator instruction (build continued without pausing). Code is grep-verified and build-clean but never visually exercised.

### 5. Settings > Team tab end-to-end click-through
**Test:** As an org admin, invite a teammate, have them accept, verify they appear in the member list, change their role, deactivate then reactivate them. Confirm none of this crosses into another org.
**Expected:** All actions succeed, persist on reload, and stay scoped to one org.
**Why human:** 15-10's `checkpoint:human-verify` gate was explicitly left open per orchestrator instruction.

### Gaps Summary

No code-level gaps found. All 13 SPEC requirements have verified, substantive, wired implementations; the full test suite (382/382 non-skipped) and build are green; all 5 edge functions and the DB migration are confirmed deployed/applied live per the orchestrator's ground-truth notes. The only open items are live/human verification steps — three of which (live email delivery for invites and resets, and the Resend/DNS/dashboard setup itself) are a single known, intentionally deferred checkpoint from plan 15-02, and two are UI click-through checkpoints (AdminPanel, TeamTab) that were deliberately left open per explicit orchestrator instruction to keep building rather than pause. None of these represent missing or stubbed code — they represent verification work that requires a live browser session, a live external inbox, or a hostile live-DB payload, none of which can be asserted from static analysis.

---

*Verified: 2026-07-14*
*Verifier: Claude (gsd-verifier)*
