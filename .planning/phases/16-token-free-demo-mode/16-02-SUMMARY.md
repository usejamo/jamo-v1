---
phase: 16-token-free-demo-mode
plan: 02
subsystem: database
tags: [supabase, provisioning, seed-script, rls, vitest]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning
    provides: invite-first provisioning (invites table + handle_new_user trigger) and scripts/bootstrap-super-admin.ts, mirrored verbatim by this seed
  - phase: 16-token-free-demo-mode
    plan: 01
    provides: demo-mode tables that every demo run writes into inside this org
provides:
  - Dedicated demo organizations row (slug jamo-demo, feature_flags.is_demo = true), live
  - Shared super_admin presenter account bound to the demo org, live
  - Idempotent, re-runnable seed script + npm entry (seed:demo-org) for reproducing both
affects: [16-03, 16-04, 16-05, 16-06, 16-07, 16-08, 16-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Org via SQL migration, account via invite-first admin-API script (never a raw auth-schema insert) — the repo-wide convention, now applied to the demo org"
    - "Idempotency guards are scoped to the org they provision, not global, so parallel super_admins (internal + demo) coexist without one suppressing the other"
    - "feature_flags marking uses jsonb merge (||) on conflict so re-application never clobbers flags written by later phases"

key-files:
  created:
    - supabase/migrations/20260721000003_demo_org.sql
    - scripts/seed-demo-org.ts
    - scripts/seed-demo-org.test.ts
  modified:
    - package.json

key-decisions:
  - "Idempotency guard scoped to the demo org (lookup org by slug, then super_admin profile in THAT org) rather than bootstrap-super-admin.ts's global 'any super_admin exists' check — the Phase-15 internal super_admin must neither suppress this seed nor be touched by it (T-16-06)."
  - "Added an explicit already-registered branch (Rule 2): if admin-API user creation fails because the email already has an account, the just-inserted PENDING super_admin invite is revoked before throwing, so a stray pending invite can never bind a later signup for that address."
  - "The seed defensively re-upserts the demo org row (same slug, is_demo flag) so it is runnable stand-alone; the migration and the script converge on the same row in any order."
  - "Presenter credentials are env-sourced only (DEMO_PRESENTER_EMAIL / DEMO_PRESENTER_PASSWORD), never hardcoded, never defaulted, and — unlike bootstrap-super-admin.ts, which logs the email — never printed."

patterns-established:
  - "Phase 16 live-infra convention (from 16-01) reused: executor writes + commits + unit-tests locally, stops at a checkpoint:human-action, orchestrator performs the live apply/run and reports verification numbers back."

requirements-completed: [SPEC-R5]

# Metrics
duration: ~25min (code tasks) + orchestrator-performed live apply/seed
completed: 2026-07-21
---

# Phase 16 Plan 02: Demo Org + Presenter Seed Summary

**A dedicated `jamo-demo` organization (feature_flags.is_demo = true) plus its shared super_admin presenter account, both provisioned reproducibly — org via a committed idempotent migration, account via an invite-first seed script that mirrors the Phase-15 bootstrap sequence and skips cleanly on re-run — now live on `fuuvdcvbliijffogjnwg`.**

## Performance

- **Duration:** ~25 min (code tasks, this executor) + orchestrator-performed live apply/seed checkpoint
- **Started:** 2026-07-21
- **Completed:** 2026-07-21
- **Tasks:** 3/3 (Tasks 1-2 by this executor; Task 3 [BLOCKING, checkpoint:human-action] performed by the orchestrator)
- **Files modified:** 4 (1 new migration, 1 new script, 1 new test, package.json)

## Accomplishments
- `supabase/migrations/20260721000003_demo_org.sql` upserts `('Jamo Demo', 'jamo-demo', 'internal', '{"is_demo": true}')` with `ON CONFLICT (slug) DO UPDATE SET feature_flags = organizations.feature_flags || '{"is_demo": true}'::jsonb` — a jsonb **merge**, so re-application marks the org without ever clobbering flags set by later phases. No schema change was required (`organizations.feature_flags jsonb` already exists, `20260305000002`), and the migration deliberately contains no auth-schema write.
- `scripts/seed-demo-org.ts` exports `DEMO_ORG` + `seedDemoOrg(admin, email, password)` running the identical 5-step Phase-15 sequence: demo-scoped idempotency guard → org upsert (`onConflict: 'slug'`, `feature_flags: { is_demo: true }`) → PENDING `invites` row (`role: 'super_admin'`) → `auth.admin.createUser({ email_confirm: true })` → flip invite to `accepted`. `loadEnv()` is duplicated verbatim and the `main(env?)` + direct-run guard keeps it Vitest-importable.
- `scripts/seed-demo-org.test.ts` (5 cases, all green) asserts: both guard branches (short-circuit when a demo super_admin exists; proceed when the org exists but has none), the full call ORDER, that the upsert carries `is_demo: true` and the invite carries `role: 'super_admin'`, and that an already-registered auth account causes the pending invite to be **revoked** and an actionable error thrown (never `accepted`).
- `npm run seed:demo-org` added to `package.json`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Demo org migration (idempotent upsert with is_demo)** - `5d377d9` (feat)
2. **Task 2: seed-demo-org.ts script + test + npm entry** - `e664788` (feat)
3. **Task 3: [BLOCKING] Apply org migration + run seed live** - performed by the orchestrator at the human-action checkpoint (live-infra only; no code artifact, therefore no commit)

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/20260721000003_demo_org.sql` - idempotent demo org upsert, jsonb-merged `is_demo` flag, org row only
- `scripts/seed-demo-org.ts` - idempotent presenter super_admin seed via the invite-first admin-API path, env-sourced credentials
- `scripts/seed-demo-org.test.ts` - 5 Vitest cases (call order, both guard branches, flag/role payloads, already-registered failure path), fake placeholder credentials only
- `package.json` - added `"seed:demo-org": "npx tsx scripts/seed-demo-org.ts"`

## Decisions Made
- **Demo-scoped idempotency guard (not the global one):** `bootstrap-super-admin.ts` short-circuits when *any* `super_admin` exists. Copying that verbatim would have made this seed a permanent no-op (the Phase-15 internal super_admin already exists). The guard instead resolves the org by slug, then looks for a `super_admin` profile **in that org**. Live verification confirmed both accounts now coexist (1 super_admin in the demo org, 1 outside it).
- **Already-registered path revokes the pending invite (Rule 2 hardening, not in the plan):** the guard cannot see an auth account that exists *without* a demo-org profile. Rather than silently leaving a PENDING `role: 'super_admin'` invite behind — which the `handle_new_user` trigger would happily consume for any later signup of that address — the seed revokes it and fails loudly with remediation instructions.
- **Uppercase SQL keywords over the plan's literal lowercase grep:** the plan's acceptance criterion greps for `on conflict (slug)`; the file uses `ON CONFLICT (slug)`, matching this repo's dominant migration style and the closest precedent for a seeded upsert (`20260427000024_template_driven_sections.sql`). The criterion was verified with `grep -qi`; intent is unchanged.
- **Comment wording avoided a false negative-grep trip:** Task 1's criterion requires that `auth.users`/`createUser` appear nowhere in the migration. An explanatory comment originally used both strings to state that the migration does *not* do those things; it was reworded ("admin-API user creation", "the Supabase auth schema") so the whole-file grep passes while the comment still says the same thing. Same class of adjustment as 16-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Explicit already-registered handling with invite revocation**
- **Found during:** Task 2
- **Issue:** The plan's 5-step sequence had no branch for `createUser` failing because the email already exists. Left unhandled, a failed run leaves an orphan PENDING `super_admin` invite that the `handle_new_user` trigger would bind to any future signup of that address — a latent privilege-escalation surface, and the T-16-06 disposition explicitly says "mitigate".
- **Fix:** `isAlreadyRegistered()` detector; on any `createUser` error the pending invite is updated to `status: 'revoked'` before throwing, and the already-registered case throws an actionable message naming the env var (not its value). Covered by a dedicated test case.
- **Files modified:** `scripts/seed-demo-org.ts`, `scripts/seed-demo-org.test.ts`
- **Commit:** `e664788`

Otherwise the plan executed as written.

## Issues Encountered
- One negative-acceptance-grep near-miss on the migration (prose comment containing `auth.users`/`createUser`), caught by running the plan's own criteria before committing and fixed by rewording. No functional SQL affected.
- `npx eslint scripts/seed-demo-org*.ts` reports "File ignored because no matching configuration was supplied" — `scripts/` is outside this repo's eslint config coverage (true for the existing `bootstrap-super-admin.ts` too). Not a regression, not in scope.

## User Setup Required

`DEMO_PRESENTER_EMAIL` and `DEMO_PRESENTER_PASSWORD` must exist in `.env` (gitignored) for `npm run seed:demo-org` to run. Both were generated by the orchestrator and written to `.env` only — their values appear in no committed file, no summary, and no commit message. Already completed; no further setup needed for this plan.

### Live apply/seed verification (performed by orchestrator, Supabase MCP + local run, project `fuuvdcvbliijffogjnwg`)
- **Pre-flight:** `organizations` has no CHECK constraint on `plan` (only `organizations_slug_key UNIQUE (slug)`), so `'internal'` is accepted; no pre-existing `jamo-demo` org; all 4 required env vars present in `.env`.
- Migration applied via Supabase MCP `apply_migration` (name `demo_org`) — success.
- `npm run seed:demo-org` → `Demo presenter super_admin seeded in org 'jamo-demo'.`
- **Idempotency evidence:** re-ran `npm run seed:demo-org` → `Demo presenter super_admin already exists in org 'jamo-demo', skipping seed.`, no duplicate rows created.
- `demo_orgs = 1`, `feature_flags->>'is_demo' = 'true'`, `plan = 'internal'`
- `user_profiles` in demo org `= 1`, `role = 'super_admin'`
- `invites` in demo org `= 1`, `status = 'accepted'`
- super_admins **outside** the demo org `= 1` — the Phase-15 internal account is untouched, confirming the demo-scoped guard behaves as designed.

## Next Phase Readiness
- The demo org id (resolvable as `select id from organizations where slug = 'jamo-demo'`) is now the org every Phase 16 edge function must bind server-side: `demo-run-start` sets `proposals.org_id` to it, `demo-reset` and the sweep assert membership in it. Resolve it by slug (or by `feature_flags->>'is_demo' = 'true'`) at runtime — do not hardcode the UUID.
- A presenter can now sign in as a super_admin whose `private.get_user_org_id()` returns the demo org, so every existing org-scoped RLS policy and both retrieval RPCs already filter to it unmodified. Decision A's confidentiality guarantee is live with zero new policy surface.
- Wave 1 is complete (16-01 + 16-02); wave 2 (16-03 capture, 16-04 run-start, 16-05 reset) is unblocked. Each of those adds an edge function, so each still needs its own explicit `supabase functions deploy` checkpoint — this repo's execute-phase never deploys automatically (memory `edge-functions-need-deploy`).
- No blockers carried forward.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260721000003_demo_org.sql
- FOUND: scripts/seed-demo-org.ts
- FOUND: scripts/seed-demo-org.test.ts
- FOUND: package.json (contains the `seed:demo-org` entry)
- FOUND: .planning/phases/16-token-free-demo-mode/16-02-SUMMARY.md
- FOUND commit: 5d377d9
- FOUND commit: e664788
- Tests: `npm run test:run -- seed-demo-org` → 5 passed / 5

---
*Phase: 16-token-free-demo-mode*
*Completed: 2026-07-21*
