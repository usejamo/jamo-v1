---
phase: 16-token-free-demo-mode
plan: 06
subsystem: database
tags: [postgres, pg_cron, plpgsql, scheduled-job, destructive, teardown, demo-sweep, drift-detection]

# Dependency graph
requires:
  - phase: 16-token-free-demo-mode
    plan: 01
    provides: demo_runs table (id, proposal_id, org_id, created_at) — the sweep's targeting registry
  - phase: 16-token-free-demo-mode
    plan: 02
    provides: the jamo-demo org (feature_flags.is_demo = true) — resolved at runtime, never hardcoded
  - phase: 16-token-free-demo-mode
    plan: 05
    provides: _shared/demoRunCleanup.ts — the teardown ORDER this SQL function mirrors and is drift-tested against
  - phase: 13-abandoned-draft-reaper
    provides: 20260713000001_reap_stuck_document_extractions.sql — the pg_cron enable + idempotent unschedule/schedule precedent
provides:
  - public.sweep_abandoned_demo_runs(p_max_batch int, p_dry_run boolean) — LIVE on fuuvdcvbliijffogjnwg
  - cron job 'demo-run-sweep', hourly ('0 * * * *'), LIVE and active
  - A p_dry_run preview mode that makes an unattended destructive job safely inspectable
  - src/lib/__tests__/demoSweepParity.test.ts — a mutation-verified drift detector between the SQL and TS teardowns
affects: [16-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "An unattended destructive job authenticates best by not being reachable: direct SQL under pg_cron has no endpoint, no bearer token and no network hop to misconfigure"
    - "When duplication is genuinely the lesser evil, fence it with an executable drift detector that parses BOTH implementations — and mutation-test the detector so it is not vacuous"
    - "A scheduled deleter fails closed on an AMBIGUOUS demo org (>1 match), not just a missing one"
    - "Guards are re-asserted per candidate row immediately before the delete, so a later edit to the selection query cannot silently widen the blast radius"
    - "Per-row BEGIN/EXCEPTION subtransactions give a batch job partial-failure safety that N separate PostgREST calls structurally cannot"
    - "Ship destructive scheduled work with a p_dry_run mode so the first live verification is non-destructive"

key-files:
  created:
    - supabase/migrations/20260721000004_demo_sweep_cron.sql
    - src/lib/__tests__/demoSweepParity.test.ts
    - .planning/phases/16-token-free-demo-mode/16-06-live-verification.sql
  modified: []

decisions:
  - "Implemented the sweep as direct pg_cron SQL, NOT a pg_net-invoked demo-sweep edge function — deviating from the plan's must_haves, because SPEC Req 9's sole justification for an edge function is void and self-contradicted by the same spec"
  - "Accepted a second teardown implementation (SQL) as the lesser evil vs. a silent hourly 401, and paid the cost down with a mutation-verified parity test rather than a sync comment"
  - "Fail closed when the demo org resolves to anything other than exactly one org"

metrics:
  duration: ~55min
  tasks_completed: 4
  files_created: 3
  commits: 3
  completed: 2026-07-21
---

# Phase 16 Plan 06: Abandoned Demo Run Sweep Summary

Hourly `pg_cron` SQL job that hard-deletes demo-org proposals still `status='draft'` whose `demo_runs` row is older than 24h — implemented as direct PL/pgSQL rather than the planned `pg_net`→edge-function call, and verified live against a production database holding 66 real proposals without touching one of them.

## What Was Built

`public.sweep_abandoned_demo_runs(p_max_batch int default 50, p_dry_run boolean default false)`, scheduled as cron job `demo-run-sweep` at `'0 * * * *'`. It mirrors `demo-reset`'s teardown exactly: clear `proposal_assumptions.source_document` (step 0), delete `proposal_documents` (step 1, cascades `document_extracts`), delete `proposals` (step 2, cascades sections/assumptions/chunks/chats/`demo_runs`), delete `demo_runs` (step 3, idempotent no-op). It never updates `proposals.status` and never touches Storage.

## Deviation from the Plan's must_haves (Rule 2 — justified, orchestrator-endorsed)

The plan mandated a `demo-sweep` edge function gated by `isInternalServiceRoleCall`, invoked by `net.http_post` with a Vault-stored bearer. **None of that was built.** The reason is that 16-SPEC contradicts itself:

- **16-SPEC.md:113 (Req 9)** requires "a **scheduled edge function** (which can call the Storage API), not a pure pg_cron SQL job (which cannot delete Storage objects and would leave orphaned files)" and says the sweep must include "**Storage-object removal**".
- **16-SPEC.md:198** — marked as the updated position — states the RFP Storage file "is a shared canonical object referenced by every run (CONTEXT D-06), so it is **retained — not deleted per run**".

So Req 9's *only* stated justification for requiring an edge function is the deletion of a file the same spec elsewhere forbids deleting. Confirmed in code: `demo-run-start/index.ts:359` — "storage_path points at the ONE shared canonical file; **nothing is uploaded per run**." There are **zero** per-run Storage objects for the sweep to remove, so the edge function buys nothing.

What it would have *cost* is real, and lands on an unattended job:

| Risk of the pg_net design | Detail |
|---|---|
| New uninstalled infrastructure | `pg_net` available 0.19.5, `installed_version` null — a new extension for one caller |
| **Unverifiable auth** | The Vault bearer must byte-match whatever the platform injects as `SUPABASE_SERVICE_ROLE_KEY`. This project's key is `sb_secret_…` format, **not a JWT** — the match cannot be confirmed in advance. A mismatch is a **silent hourly 401 forever** |
| No atomicity | 4 separate PostgREST calls per run cannot be transactional; a mid-row failure leaves half-torn-down state |

Direct SQL has none of these: no endpoint, no secret to provision or leak, no network hop, per-row atomicity, and it matches the repo's only existing cron precedent.

### The cost that was accepted, and how it is fenced

Teardown now exists **twice** — in this migration and in `_shared/demoRunCleanup.ts`. A destructive routine that drifts between two copies leaks rows silently for months. This is fenced by `src/lib/__tests__/demoSweepParity.test.ts` (25 assertions), which parses the committed bytes of **both** files and asserts the ordered set of teardown statements is identical, plus every guard, prohibition and schedule property.

**The detector was mutation-tested, not trusted:** removing step 0 from the migration fails exactly 2 of 25 tests; dropping the proposal-org guard and weakening the age bound to 1 hour fails 3. The orchestrator independently reproduced the step-0 mutation and confirmed the same 2 failures. File restored clean; full suite 461 passed / 0 failed.

## Deviations — Auto-fixed

**1. [Rule 1 - Bug, found and fixed by the orchestrator] `min(uuid)` does not exist — the job would have failed silently forever**
- **Found during:** Task 4, by the post-apply dry run (commit `339153d`)
- **Issue:** demo-org resolution used `select count(*), min(o.id) into …`. **Postgres has no `min()` aggregate for `uuid`**, so every invocation raised `42883: function min(uuid) does not exist`. The job was *already scheduled hourly*, so this would have failed into the cron log on every fire, forever, with no user-visible signal — **the exact silent-scheduled-failure mode this plan's whole design argument was built to avoid.** It simply re-entered as a type error instead of an auth error. This is not a typo: it is a live defect that would have made the sweep a permanent no-op while appearing correctly scheduled.
- **Fix:** `(array_agg(o.id order by o.id))[1]`, with an in-file warning against "simplifying" it back to `min()`. Fail-closed semantics on 0 or >1 matches unchanged.
- **Why tests could not catch it:** the parity/guard tests parse SQL *text*; the behavioural tests are a TypeScript simulator. No Postgres runs in this environment. Only executing the function could surface it — which is precisely why `p_dry_run` and the post-apply verification script exist.

## Live Verification (orchestrator, via Supabase MCP, after the fix)

| Check | Result |
|---|---|
| `cron.job` | 1 row — `demo-run-sweep`, `0 * * * *`, `active = true` |
| Demo org resolution | exactly **1** (fail-closed condition satisfied) |
| `sweep_abandoned_demo_runs(50, true)` (dry run) | 0 targets |
| `sweep_abandoned_demo_runs(50, false)` (**REAL, non-dry, against production**) | **0 swept** |
| `demo_runs` remaining | 0 |
| **`proposals`** | **66 — untouched** |
| **`proposal_documents`** | **38 — untouched** |

The last three rows are the meaningful result: **a real, non-dry invocation ran against a production database holding 66 real proposals and 38 real documents and deleted nothing.** The guards were exercised against real client data, not an empty table. This is the **first genuine live verification Phase 16 has achieved** — every prior plan's live check reached only a pre-condition error path.

## Known Gaps — what remains unproven

**No abandoned run has ever been swept, because none has ever existed.** `demo_runs` is empty. Unproven against real data:
- the 24h age path (nothing has aged),
- per-row exception isolation (`exception when others`),
- the `skipped_guard` branch,
- `p_max_batch` truncation.

These clear as soon as one real demo run exists and ages past 24h — the same unblocking step (capture one real demo-org fixture) that Wave 2's standing verification debt needs.

## Self-Check: PASSED

- `supabase/migrations/20260721000004_demo_sweep_cron.sql` — FOUND
- `src/lib/__tests__/demoSweepParity.test.ts` — FOUND
- `.planning/phases/16-token-free-demo-mode/16-06-live-verification.sql` — FOUND
- commits `ea18a14`, `ae0cbe6`, `339153d` — all FOUND
- `npm run test:run` — 461 passed, 16 skipped, 0 failed
