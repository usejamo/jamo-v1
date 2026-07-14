---
phase: 15
slug: client-onboarding-provisioning
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-13
finalized: 2026-07-13
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `15-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.4 (client + edge-adjacent unit tests) + Deno built-in test runner for edge functions (`test.ts`, `ignore:true` where live Deno is unavailable in the dev sandbox — matches the Phase 14.3 contingency pattern) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `npm run test:run` (no separate coverage split — kept under ~15s per STATE.md) |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run test:run` (client unit) + `deno test <changed-function>/test.ts` where Deno is available; else grep-based acceptance per the established contingency.
- **After every plan wave:** Full `npm run test:run` + a live smoke pass against the hosted Supabase project for DB-trigger-related items (req 12 tamper test, req 8 live resend).
- **Before `/gsd-verify-work`:** Full suite green + the mandatory human-verify checkpoints for reqs 5, 9, 10 (live email delivery / link click).
- **Max feedback latency:** ~15 seconds (unit); live-email checkpoints are manual gates, not sampled.

---

## Per-Task Verification Map

| Req (SPEC) | Behavior | Test Type | Automated Command | File Exists |
|-----------|----------|-----------|-------------------|-------------|
| 15-01 | Signup disabled, config committed | unit/static | grep-based config assertion reading `supabase/config.toml` text | ❌ W0 |
| 15-02 | `/admin` gated to super_admin | unit (component) | `npm run test:run -- SuperAdminRoute` | ❌ W0 |
| 15-03 | Org creation + unique slug | unit (pure fn) | `npm run test:run -- slug` (slug/retry logic, mocked Supabase) | ❌ W0 |
| 15-04 | First-admin invite server-bound | Deno test (`ignore:true` scaffold; live-verify deferred) | `deno test supabase/functions/admin-invite-first-admin/test.ts` | ❌ W0 |
| 15-05 | Invite acceptance + password set | manual-only (live email + real link click) | N/A — human-verify checkpoint | — |
| 15-06 | Org-admin teammate invite, own-org only | Deno test (authorization predicate) | `deno test supabase/functions/team-invite/test.ts` | ❌ W0 |
| 15-07 | Member management (role change, deactivate) | Deno test (`ban_duration` call asserted) + RLS predicate unit | `deno test supabase/functions/team-manage/test.ts` | ❌ W0 |
| 15-08 | Invite lifecycle (list/resend/revoke) | Deno test + manual-only for actual resend email | `deno test supabase/functions/admin-invites-lifecycle/test.ts` | ❌ W0 |
| 15-09 | Resend SMTP delivers | manual-only (external email delivery) | N/A — human-verify, check external inbox | — |
| 15-10 | Password reset flow | unit (component) + manual-only for live email | `npm run test:run -- ResetPassword` | ❌ W0 |
| 15-11 | super_admin bootstrap idempotent | Deno/Node test (run twice, assert 2nd run no-ops) | `deno test scripts/bootstrap-super-admin.test.ts` | ❌ W0 |
| 15-12 | Trigger RAISEs on no-match, tamper-proof | SQL-level test (direct `INSERT INTO auth.users` w/o pending invite → assert exception); live DB required | manual-only or `psql` script if a test DB is reachable | ❌ W0 |
| 15-13 | Dead code removed | static/grep | `grep -rn "signUp\|Test Org" src/` returns no hits | N/A (grep) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/admin-invite-first-admin/test.ts`, `team-invite/test.ts`, `team-manage/test.ts`, `admin-invites-lifecycle/test.ts` — Deno stub scaffolds (`ignore:true` where live Deno unavailable) — reqs 4, 6, 7, 8
- [ ] `scripts/bootstrap-super-admin.test.ts` — req 11 idempotency
- [ ] `src/components/SuperAdminRoute.test.tsx` (or equivalent) — req 2
- [ ] Pure-function unit test file for slug generation/retry — req 3
- [ ] Static/grep assertions for reqs 1 and 13 (config + dead-code removal)

*Vitest is already fully configured — the gap is new test FILES for new code, not framework setup.*

---

## Manual-Only Verifications

| Behavior | Req | Why Manual | Test Instructions |
|----------|-----|------------|-------------------|
| Invite email delivers + set-password link works | 15-05 | Live email + real link click can't run in CI | Provision test org, invite an external address, click link, set password, confirm authenticated session scoped to correct org; confirm link can't be reused |
| Resend SMTP delivers from verified sender | 15-09 | External email delivery not assertable in CI | Trigger a live invite + a live reset; confirm both arrive from the Resend sender (not inbucket/default) |
| Password-reset email delivers | 15-10 | Live email delivery | Request reset for a known user; follow link; set new password; sign in with new (not old) |
| Trigger tamper-proofing | 15-12 | Requires live DB + hostile client payload | Issue invite for Org A/`user`; accept with tampered Org B/`admin` payload; assert profile lands Org A/`user` |
| Edge-function deploy + live bootstrap (Plan 15-08 ops tasks) | 15-04/06/07/08/11 | Pure deploy/live-ops — "did it deploy / did bootstrap run" cannot be unit-tested; matches repo precedent (14.3-05, 14.5-03, 14.6-05, 14.7-06/07) | 14.3 gate verified deployed first; deploy all 5 edge functions (sbp_ token); confirm each shows deployed in the live project; run bootstrap script live and confirm a `super_admin` can reach `/admin`; re-run bootstrap to confirm idempotency |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (manual-only items 5/9/10/12 + Plan-08 deploy/bootstrap ops explicitly flagged in Manual-Only Verifications)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — EXCEPT Plan 15-08 (Wave 4), a pure deploy/live-ops plan whose 3 ops tasks (14.3-gate check, 5-fn deploy, live bootstrap) are unavoidably manual; carved out explicitly per established repo precedent (14.3-05, 14.5-03, 14.6-05, 14.7-06/07)
- [x] Wave 0 covers all MISSING references — delivered co-located inside implementing plans rather than a separate `15-00-PLAN.md` (slug test → 15-04, bootstrap idempotency test → 15-07, SuperAdminRoute test → 15-11, config-signup assertion → 15-02, ResetPassword test → 15-03; Deno function scaffolds authored alongside their functions)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter (Wave-0 coverage assigned to implementing plans; test files authored during execution)

**Approval:** approved 2026-07-13 (validation strategy finalized; Wave-0 test files are co-located in the plans and written during execution, not pre-authored)
