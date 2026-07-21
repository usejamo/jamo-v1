---
phase: 16
slug: token-free-demo-mode
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-20
updated: 2026-07-21
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated from 16-RESEARCH.md `## Validation Architecture`. Wave 0 test stubs are authored
> as the FIRST task of the relevant plan (not a separate Wave-0 plan), so `wave_0_complete`
> stays `false` until those tasks execute.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.4 (frontend/scripts/pure-logic) + Deno test (edge functions) |
| **Config file** | `vitest.config.ts` (repo root); each edge fn has its own `deno.json` |
| **Quick run command** | `npm run test:run` (no `--coverage`, <15s) |
| **Full suite command** | `npm run test:run` (Deno edge-fn `test.ts` NOT run by this — `deno test` is **unavailable in this dev sandbox**; edge-fn tests use grep/predicate + `ignore:true` acceptance per the repo-wide Phases 14.3/15 contingency) |
| **Estimated runtime** | ~10–15 seconds (Vitest) |

**Contingency (repo-wide):** Deno unavailable locally → every edge-function `test.ts` uses pure-predicate `Deno.test` + `Deno.test({ ignore: true })` integration stubs (mirrors `admin-create-org/test.ts`). Live behavioral verification is deferred to the deploy + presenter-E2E passes (16-01/02/03/04/05/06 blocking checkpoints, 16-09 human-verify).

---

## Sampling Rate

- **After every task commit:** `npm run test:run` (Vitest — frontend + pure-logic pieces incl. `demoFixtureValidation`, `isSweepable`, the Req-6 guard); grep-acceptance review of the relevant edge-fn `test.ts`.
- **After every plan wave:** full `npm run test:run` + a manual review pass confirming no `is_demo`/`demo_run`/`demo_fixture`/`demoMode` string in any below-population path (Req 6 negative acceptance, automated by `no-demo-branch-below-population.test.ts`).
- **Before `/gsd-verify-work`:** full suite green + all new/changed edge fns deployed live + Supabase MCP verification that the 5 tables/RLS/clone RPC/demo-org/cron job exist and the sweep produced a `net._http_response` row.
- **Max feedback latency:** ~15 seconds (Vitest).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | SPEC-R2/R5/R8 | T-16-01 | super_admin-only RLS on all 5 demo tables; no cross-org bypass | static (grep migration) | `grep -c "enable row level security" .../20260721000001_demo_fixture_tables.sql` (==5) | ✅ (this task) | ⬜ pending |
| 16-01-02 | 01 | 1 | SPEC-R3 | T-16-02/T-16-04 | clone RPC service_role-only, no model call, cascade-safe | static (grep migration) | `grep -q "grant execute ... to service_role" .../20260721000002_*.sql` | ✅ (this task) | ⬜ pending |
| 16-01-03 | 01 | 1 | SPEC-R2/R3/R5/R8 | — | schema live before DB-dependent verification | live (MCP) | MISSING — Supabase MCP: 5 tables + RPC exist; `grep -q demo_fixtures src/types/database.types.ts` | ❌ live | ⬜ pending |
| 16-02-01 | 02 | 1 | SPEC-R5 | T-16-06 | idempotent demo-org upsert, jsonb merge (no clobber) | static (grep migration) | `grep -q "on conflict (slug)" .../20260721000003_demo_org.sql` | ✅ (this task) | ⬜ pending |
| 16-02-02 | 02 | 1 | SPEC-R5 | T-16-05/T-16-06 | env-sourced secrets; idempotent presenter seed | unit (Vitest, call-order) | `npm run test:run -- seed-demo-org` | ❌ Wave 0 (this task) | ⬜ pending |
| 16-02-03 | 02 | 1 | SPEC-R5 | T-16-07 | demo org + single super_admin bound live | live (MCP) | MISSING — Supabase MCP org/profile queries | ❌ live | ⬜ pending |
| 16-03-01 | 03 | 2 | SPEC-R1/R2/R5 | T-16-08/09/10/11 | super_admin gate + demo-org source assert + versioned snapshot | static (grep) | `grep -q "super_admin required" .../demo-capture-fixture/index.ts` | ✅ (this task) | ⬜ pending |
| 16-03-02 | 03 | 2 | SPEC-R2 | T-16-11 | recapture → new version predicate | unit (Deno predicate) | `grep -q "ignore: true" .../demo-capture-fixture/test.ts` (+ predicate) | ❌ Wave 0 (this task) | ⬜ pending |
| 16-03-03 | 03 | 2 | SPEC-R1 | T-16-08 | function deployed live | live (deploy) | MISSING — `supabase functions deploy demo-capture-fixture` | ❌ live | ⬜ pending |
| 16-04-01 | 04 | 2 | SPEC-R7 | T-16-14 | fixture/template mismatch → named-section abort before any write | unit (Vitest, pure) | `npm run test:run -- demoFixtureValidation` | ❌ Wave 0 (this task) | ⬜ pending |
| 16-04-02 | 04 | 2 | SPEC-R1/R3/R4/R5 | T-16-12/13/15/16 | gated, server-bound identity, clone-not-embed, atomic isolated run | static (grep) | `grep -q "clone_demo_fixture_chunks" .../demo-run-start/index.ts` + no-model-call grep | ✅ (this task) | ⬜ pending |
| 16-04-03 | 04 | 2 | SPEC-R1 | T-16-12 | test stub + deploy | unit (Deno predicate) + live | `grep -q "ignore: true" .../demo-run-start/test.ts`; MISSING — deploy | ❌ Wave 0 + live | ⬜ pending |
| 16-05-01 | 05 | 2 | SPEC-R8 | T-16-20/21 | explicit proposal_documents delete (orphan), no Storage delete | static (grep) | `grep -q "delete from proposal_documents where proposal_id" .../_shared/demoRunCleanup.ts` | ✅ (this task) | ⬜ pending |
| 16-05-02 | 05 | 2 | SPEC-R1/R8 | T-16-17/18/19 | run-scoped triple-guard (demo org + draft + demo_runs) | static (grep) | `grep -q "reset refused" .../demo-reset/index.ts` | ✅ (this task) | ⬜ pending |
| 16-05-03 | 05 | 2 | SPEC-R8 | T-16-18 | triple-guard predicate + deploy | unit (Deno predicate) + live | `npm run test:run` (isResettableRun); MISSING — deploy | ❌ Wave 0 + live | ⬜ pending |
| 16-06-01 | 06 | 3 | SPEC-R1/R9 | T-16-22/24 | internal-only gate; shared cleanup; never flips status | static (grep) | `grep -q "isInternalServiceRoleCall" .../demo-sweep/index.ts` + no status-flip grep | ✅ (this task) | ⬜ pending |
| 16-06-02 | 06 | 3 | SPEC-R9 | T-16-23/25 | Vault-referenced secret (no literal), idempotent hourly cron | static (grep) | `grep -q "cron.schedule('demo-run-sweep'" .../20260721000004_demo_sweep_cron.sql` | ✅ (this task) | ⬜ pending |
| 16-06-03 | 06 | 3 | SPEC-R9 | T-16-24 | 24h-threshold predicate | unit (Deno predicate) | `grep -q "isSweepable" .../demo-sweep/test.ts` + `grep -q "ignore: true" ...` | ❌ Wave 0 (this task) | ⬜ pending |
| 16-06-04 | 06 | 3 | SPEC-R1/R9 | T-16-22/25 | pg_net verified live; deploy; cron fires (net._http_response 2xx) | live (MCP + deploy) | MISSING — MCP pg_net/cron.job/net._http_response | ❌ live | ⬜ pending |
| 16-07-01 | 07 | 3 | SPEC-R2 | T-16-26/27 | capture action renders only for super_admin | static (grep) + build | `grep -q "functions.invoke('demo-capture-fixture'" src/pages/ProposalDetail.tsx` | ✅ (this task) | ⬜ pending |
| 16-07-02 | 07 | 3 | SPEC-R2 | — | vestigial Reset Demo/labels removed | static (negative grep) | `grep -rc "Reset Demo" src/components/Sidebar.tsx` (==0) | ✅ (this task) | ⬜ pending |
| 16-07-03 | 07 | 3 | SPEC-R2 | T-16-26 | role-gate + invoke-target component test | unit (Vitest) | `npm run test:run -- SaveAsDemoFixture` | ❌ Wave 0 (this task) | ⬜ pending |
| 16-08-01 | 08 | 3 | SPEC-R6 | T-16-28 | no demo branch below population (fence, 5 paths) | unit (Vitest, negative) | `npm run test:run -- no-demo-branch-below-population` | ❌ Wave 0 (this task) | ⬜ pending |
| 16-08-02 | 08 | 3 | SPEC-R4 | T-16-30 | driver uses server proposal_id, no fake streaming / no real gen call | static (grep) + build | `grep -q "functions.invoke('demo-run-start'" src/hooks/useDemoRun.ts` + no-stream grep | ✅ (this task) | ⬜ pending |
| 16-08-03 | 08 | 3 | SPEC-R4 | T-16-29 | standard template pre-select + hard lock | unit (Vitest) | `npm run test:run -- DemoRunSurface` | ❌ Wave 0 (this task) | ⬜ pending |
| 16-09-01 | 09 | 4 | SPEC-R8 | T-16-31/32 | reset with session demo_run_id; no page reload (D-11) | static (grep) + build | `grep -q "functions.invoke('demo-reset'" src/components/demo/DemoResetControl.tsx` + no-reload grep | ✅ (this task) | ⬜ pending |
| 16-09-02 | 09 | 4 | SPEC-R8 | T-16-32/33 | invoke-target + run-scoped id + in-session reset component test | unit (Vitest) | `npm run test:run -- DemoResetControl` | ❌ Wave 0 (this task) | ⬜ pending |
| 16-09-03 | 09 | 4 | SPEC-R2..R9 | T-16-31 | full presenter loop live; no orphaned doc rows; RFP file retained | manual (human-verify) | MISSING — presenter E2E (Deno/live unavailable in sandbox) | ❌ live | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 test scaffolds are authored as the first task of the plan that owns each behavior (no separate Wave-0 plan). To be created during execution:

- [ ] `scripts/seed-demo-org.test.ts` — seed call-order + idempotency (16-02-02)
- [ ] `supabase/functions/demo-capture-fixture/test.ts` — version-increment predicate + `ignore:true` stub (16-03-02)
- [ ] `src/lib/demoFixtureValidation.ts` + `src/lib/__tests__/demoFixtureValidation.test.ts` — pure Req-7 diff (16-04-01)
- [ ] `supabase/functions/demo-run-start/test.ts` — gate predicate + `ignore:true` stubs (16-04-03)
- [ ] `supabase/functions/demo-reset/test.ts` — `isResettableRun` triple-guard + delete-set + `ignore:true` (16-05-03)
- [ ] `supabase/functions/demo-sweep/test.ts` — `isSweepable` 24h threshold + `ignore:true` (16-06-03)
- [ ] `src/components/__tests__/SaveAsDemoFixture.test.tsx` — capture role-gate + invoke target (16-07-03)
- [ ] `src/__tests__/no-demo-branch-below-population.test.ts` — Req-6 negative fence (16-08-01)
- [ ] `src/components/__tests__/DemoRunSurface.test.tsx` — template lock + run-start invoke (16-08-03)
- [ ] `src/components/__tests__/DemoResetControl.test.tsx` — reset invoke + run-scoped id + no-reload (16-09-02)
- [ ] Framework install: none — Vitest already configured; `pg_net` is a Postgres extension enable, not an npm/Deno package.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Presenter add-RFP → extract → assumptions → locked template → paced populate (no streaming) | SPEC-R4 | Full wizard E2E; live Realtime/reveal timing; Deno/live unavailable in sandbox | 16-09 Task 3 how-to-verify step 2 |
| Real RFP + regulatory citations post-generation; behaves like a real draft | SPEC-R3/R6 | Requires live Anthropic + retrieve-context against cloned chunks | 16-09 Task 3 step 3 |
| Reset removes all rows incl. proposal_documents; RFP file retained; no reload | SPEC-R8 | Requires live DB delete + Storage inspection + MCP orphan count | 16-09 Task 3 step 4 + MCP orphan query |
| Two concurrent runs isolated | SPEC-R5 | Concurrency not simulatable in Deno-unavailable sandbox | 16-09 Task 3 step 5 (two tabs) |
| Sweep removes >24h draft demo runs; cron fires | SPEC-R9 | Requires live pg_cron/pg_net + `net._http_response` | 16-06 Task 4 how-to-verify |
| Non-super_admin gets 403 from every demo endpoint | SPEC-R1 | Requires live request from a non-super_admin JWT | Deploy passes (16-03/04/05/06) then live smoke during 16-09 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency / blocking live checkpoint with a `MISSING` marker
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (verified per plan)
- [x] Wave 0 covers all MISSING references (mapped above; authored in-plan during execution)
- [x] No watch-mode flags (`test:run` is single-shot, no `--coverage`)
- [x] Feedback latency < 15s (Vitest)
- [x] `nyquist_compliant: true` set in frontmatter (plan design compliant; `wave_0_complete` remains false until stubs are authored during execution)

**Approval:** planned 2026-07-21 (execution will flip `wave_0_complete: true` once the Wave 0 stubs above exist and pass)
