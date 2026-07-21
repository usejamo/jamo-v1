---
phase: 16-token-free-demo-mode
plan: 05
subsystem: edge-functions
tags: [supabase, edge-function, deno, super-admin-gate, destructive, teardown, fk-cascade, demo-reset]

# Dependency graph
requires:
  - phase: 16-token-free-demo-mode
    plan: 01
    provides: demo_runs table (id, proposal_id, fixture_id, started_by, org_id) — the reset target registry
  - phase: 16-token-free-demo-mode
    plan: 02
    provides: the jamo-demo org (feature_flags.is_demo = true) and the presenter super_admin this endpoint requires
  - phase: 16-token-free-demo-mode
    plan: 04
    provides: demo-run-start — the writer of the runs this function tears down; its abort() teardown is the shape reused here
  - phase: 14.3-edge-identity-hardening
    provides: getAuthedUserAndOrg / jsonError — identity from the verified JWT, never the request body
provides:
  - demo-reset edge function, DEPLOYED on fuuvdcvbliijffogjnwg (verify_jwt true)
  - cleanupDemoRun(admin, run) — THE single demo-run teardown routine; 16-06's sweep must call it, not reimplement it
  - isResettableRun / isRunInDemoOrg — fail-closed triple-guard predicates
  - A live-verified FK map of everything referencing proposals and proposal_documents
affects: [16-06, 16-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Destructive teardown lives in ONE shared routine (_shared/demoRunCleanup.ts) called by both the interactive reset and the scheduled sweep — a second copy would drift and leak rows invisibly"
    - "A guard that cannot PROVE its target is in scope refuses and deletes nothing: every predicate fails closed on null, blank and mismatched input"
    - "Deletion order is derived from FK delete-actions, not from intuition; the order is documented in-file with the specific constraint each step depends on"
    - "Edge modules with no Deno-runtime imports are imported DIRECTLY by Vitest instead of being duplicated into src/ — real coverage of the deployed bytes, zero drift surface (supersedes the 16-04 duplicate-plus-parity-test pattern where applicable)"
    - "Blast-radius rules are enforced by static assertions over the source (no .remove(, no literal UUID, no direct .delete() in the handler), not by convention"

key-files:
  created:
    - supabase/functions/_shared/demoRunCleanup.ts
    - supabase/functions/demo-reset/index.ts
    - supabase/functions/demo-reset/deno.json
    - supabase/functions/demo-reset/test.ts
    - src/lib/__tests__/demoRunCleanup.test.ts
  modified: []

decisions:
  - "cleanupDemoRun throws on the first failed step rather than continuing — a step-1 failure that proceeded to delete the proposal would strand the document row permanently (SET NULL makes it unjoinable)"
  - "Step 3 (delete demo_runs) is a no-op after the proposals cascade and is kept deliberately, so the routine stays correct and idempotent for an already-orphaned run row — the sweep will meet exactly that case"
  - "The triple-guard is 'IS a draft demo run in the demo org', NOT per-user ownership: under the shared demo login ownership is unverifiable (D-07/D-10), so cross-presenter reset is an accepted bounded risk (T-16-19)"
  - "demo-reset carries its own orgIsDemo copy rather than importing demo-run-start's — coupling two deploy units through a sibling function directory would make each deploy depend on the other's tree"

metrics:
  tasks: 3
  commits: 5
  duration: ~50m
  completed: 2026-07-21
---

# Phase 16 Plan 05: demo-reset Summary

Super_admin-gated, run-scoped, triple-guarded hard delete of one demo run, with teardown factored into a single shared routine whose delete order is dictated by a live-verified FK map — including one NO ACTION constraint that would have made every reset fail.

## What Was Built

**`supabase/functions/_shared/demoRunCleanup.ts`** — the one and only demo-run teardown. Four steps, in a load-bearing order:

| Step | Operation | Why it is where it is |
|---|---|---|
| 0 | `UPDATE proposal_assumptions SET source_document = NULL WHERE proposal_id = …` | `proposal_assumptions.source_document → proposal_documents(id)` is **NO ACTION** — a populated ref would make step 1 fail with an FK violation |
| 1 | `DELETE FROM proposal_documents WHERE proposal_id = …` | FK to `proposals` is **SET NULL**, not cascade — the row and its `document_extracts` survive a proposal delete and become unjoinable |
| 2 | `DELETE FROM proposals WHERE id = …` | cascades sections, assumptions, cloned chunks, chats, chat_sessions, section_versions, and `demo_runs` |
| 3 | `DELETE FROM demo_runs WHERE id = …` | no-op after step 2's cascade; kept for idempotency and already-orphaned run rows (the sweep's case) |

It throws on the first failure rather than partially succeeding, performs **DB deletes only**, and never touches a bucket object — the canonical demo RFP file is referenced by every run and owned by none (D-06).

**`supabase/functions/demo-reset/index.ts`** — identity from the verified JWT only; `super_admin` re-read from `user_profiles` (the profile PK, which is what `demo_runs.started_by` references) → 403 otherwise; the caller's **own** org must be the demo org, resolved at runtime by `feature_flags.is_demo` / the `jamo-demo` slug, never a hardcoded UUID. Role alone is insufficient: a second super_admin exists and lives in a real internal org, and a role-only gate would let that account aim this endpoint at real client data.

The target is `demo_run_id` **from the request body** (D-10), verified server-side — deliberately not "the caller's current run", which is ambiguous under a shared login and could pick up another presenter's live session. Then the triple-guard, all three legs fail-closed: the `demo_runs` row is registered to the demo org **AND** its proposal is in the demo org **AND** that proposal is `status = 'draft'`. Any unproven leg → `403 reset refused: not a resettable demo run`, zero rows touched. The handler contains no `.delete()` of its own (statically asserted); deletion is delegated entirely to the shared routine.

## Live FK Verification (via `pg_constraint.confdeltype`, project `fuuvdcvbliijffogjnwg`)

Every FK referencing `proposals` and `proposal_documents` was enumerated — not just the five the executor listed.

| Constraint | Delete action | Handled by |
|---|---|---|
| `proposal_documents.proposal_id → proposals` | **SET NULL** | step 1 (explicit) |
| `usage_events.proposal_id → proposals` | **SET NULL** | intentionally left — billing telemetry |
| `proposal_assumptions.source_document → proposal_documents` | **NO ACTION** | step 0 (see deviations) |
| `document_extracts.document_id → proposal_documents` | CASCADE | step 1 |
| `demo_runs.proposal_id → proposals` | CASCADE | step 2 |
| `chunks.proposal_id → proposals` | CASCADE | step 2 |
| `proposal_sections`, `proposal_assumptions.proposal_id`, `proposal_chats`, `chat_sessions`, `proposal_section_versions` → `proposals` | CASCADE | step 2 |

No table needs an additional explicit delete. Nothing leaks.

## Verification

- `npm run test:run` green — 434 passed / 16 skipped at commit `4f8feec`; `src/lib/__tests__/demoRunCleanup.test.ts` now 21/21 after `d93de75`.
- `npm run build` passes.
- All Task 1/2/3 acceptance greps pass, including the negative one (no bucket-object reference in the cleanup module).
- Deployed: `npx supabase functions deploy demo-reset --project-ref fuuvdcvbliijffogjnwg` → "Deployed Functions." Bundle: `index.ts`, `deno.json`, `_shared/demoRunCleanup.ts`, `_shared/auth.ts`.

### How the assertions actually ran

Deno is not installed in this environment, so `supabase/functions/demo-reset/test.ts` (19 `Deno.test` cases) **did not execute here**. `demoRunCleanup.ts` has zero Deno-runtime imports, so rather than duplicating it into `src/` per the 16-04 pattern, Vitest imports the **real edge module** and runs it under Node — 21 assertions against the exact bytes that were deployed, with no drift surface to guard. They cover: a forged run id naming a real client-org proposal is refused; non-draft refused; every null/blank input fails closed; the 4-step order; `proposal_assumptions` is only ever `UPDATE`d and never deleted (row removal stays with the cascade); a step-0 failure performs **zero** deletes; a step-1 failure aborts before the proposal delete; no bucket object is deleted; no literal UUID appears in the handler.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `proposal_assumptions.source_document` NO ACTION would have broken every reset**
- **Found during:** post-implementation live FK enumeration (orchestrator, pre-close-out)
- **Issue:** `proposal_assumptions.source_document → proposal_documents(id)` is `ON DELETE NO ACTION`. It targets `proposal_documents`, **not** `proposals`, so the proposals cascade never clears it. Being NO ACTION, a populated reference would make step 1's `proposal_documents` delete **fail with a foreign-key violation**, failing the entire reset and leaving that run permanently unresettable — reported through an error naming a table that looks unrelated to demo mode. The plan's interface notes, the SPEC's orphan caveat and the executor's own migration reading all missed it because all three enumerated FKs pointing at `proposals`, and this one points at `proposal_documents`.
- **Status: DORMANT, not active.** No code anywhere writes that column (only type definitions reference it) and 0 of 629 live `proposal_assumptions` rows populate it. No reset would fail today. The fix keeps the hazard harmless if a future feature starts populating it.
- **Fix:** added step 0 to `cleanupDemoRun` — null the refs for the run's proposal before step 1. Also corrected the module's "FK ASSUMPTIONS THIS ORDER DEPENDS ON" comment block, which claimed to enumerate the constraints the order depends on but omitted this one and `usage_events`.
- **Files modified:** `supabase/functions/_shared/demoRunCleanup.ts`, `src/lib/__tests__/demoRunCleanup.test.ts`
- **Commit:** `d93de75`

**2. [Rule 3 — Blocking] `AdminClient` parameter type loosened**
- **Found during:** Task 2
- **Issue:** the initial minimal structural type modelled `.eq()` as returning `Promise<{error}>`; supabase-js returns a thenable `PostgrestFilterBuilder`, which is not structurally assignable and would fail a strict typecheck at deploy.
- **Fix:** typed `from` as returning `any` with a `deno-lint-ignore` and a comment recording the shape actually used, rather than mis-modelling the builder.
- **Commit:** `7146fac`

### Additive Choices (documented, not deviations from intent)

- `isRunInDemoOrg` added alongside the plan-specified `isResettableRun`. The plan's signature covers only the proposal legs of the triple-guard; the `demo_runs`-membership leg needed its own fail-closed predicate rather than a bare inline `===`.
- `cleanupDemoRun` throws instead of returning silently. The plan specified `Promise<void>`; a void routine that swallows delete errors would report a successful reset that deleted nothing.
- Eight `ignore: true` integration stubs written instead of the plan's two, to enumerate the full set of deferred live verifications.

## Not Exercised (owed verifications)

`demo_fixtures` and `demo_runs` are both **empty**. **No successful reset has been performed** — none is possible, because there is nothing to reset. Only the 403 / 400 / 404 refusal paths are reachable against the deployed function today. Specifically unproven live:

1. A successful end-to-end reset deleting a real run.
2. That after a reset no orphaned `proposal_documents` / `document_extracts` rows remain for that run.
3. That the shared canonical RFP file still exists in the `documents` bucket afterwards (it also **does not exist yet** — still un-uploaded, carried forward from 16-04).
4. Concurrent-run isolation: resetting run A leaves run B fully intact under the shared login.
5. The step-0 `source_document` clear against real data (the column is unpopulated, so it is a no-op in practice).

These are recorded as the eight `ignore: true` stubs in `supabase/functions/demo-reset/test.ts` and become executable as soon as 16-07 captures the first fixture and 16-08 starts the first run.

## Self-Check: PASSED

- Files: 5/5 found (`_shared/demoRunCleanup.ts`, `demo-reset/{index.ts,deno.json,test.ts}`, `src/lib/__tests__/demoRunCleanup.test.ts`)
- Commits: 4/4 found (`589924f`, `7146fac`, `4f8feec`, `d93de75`)
- Tests: 21/21 pass in the plan's suite; full suite green

## Carry-Forward for Wave 3

1. **16-06's sweep MUST call `cleanupDemoRun`, never reimplement it.** That is the entire reason the module exists. A sweep with its own delete sequence will drift from this one and leak rows silently.
2. `cleanupDemoRun` **throws** on any failure. A bulk sweep must wrap each run in its own try/catch so one bad run does not abort the whole batch — and should log which run failed.
3. The sweep will routinely meet **already-orphaned `demo_runs` rows** (proposal deleted by a prior reset). Step 3's apparent redundancy is what makes the routine correct for them.
4. `cleanupDemoRun` performs **no authorization of its own** — it deletes whatever it is handed. The sweep must apply its own scoping (demo org + `demo_runs` membership + age threshold) before calling it.
5. **The shared canonical RFP file is never deleted** — not by reset, not by sweep, not by any teardown. SPEC Req 9's "including Storage-object removal" wording is superseded by D-06 and by this plan's implementation: per-run rows only. Do not add a bucket delete to the sweep.
6. `demo-reset` is `verify_jwt: true` and expects `POST { "demo_run_id": "<uuid>" }`; it returns `{ ok: true, demo_run_id }`. 16-09's reset control must hold the run id from `demo-run-start`'s response in session state — there is no server-side "current run" lookup and there must not be one.
7. Prerequisite still open from 16-04: the canonical Storage object `{demoOrgId}/demo/canonical-demo-rfp.pdf` has **not been uploaded**. Until it is, a run produces correct DB rows but the RFP download 404s mid-demo.
