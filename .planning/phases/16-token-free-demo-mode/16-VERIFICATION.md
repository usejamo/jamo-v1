---
phase: 16-token-free-demo-mode
verified: 2026-07-21T23:10:00Z
status: human_needed
score: 9/9 requirements implemented; 1/9 verified live
verdict_summary: "Fully built and reviewed. Never run. The demo path has not been exercised end-to-end even once."
implementation_complete: true
live_verification_complete: false
deployed:
  db_objects: true
  edge_functions: [demo-capture-fixture, demo-run-start, demo-reset]
  cron_job: "demo-run-sweep @ '0 * * * *' — ACTIVE"
  frontend: false # committed locally, 46 unpushed commits; Netlify prod does not have it
requirement_verdicts:
  implemented_and_verified_live: 1   # Req 9 (sweep half only)
  implemented_unverified: 7          # Req 1, 2, 3, 4, 5, 7, 8
  partial: 1                         # Req 9 overall (sweep live; draft-floor + no-flip unobserved)
  missing: 0
blocking_human_prerequisites:
  - id: PREREQ-1
    what: "Capture the first fixture via the 16-07 UI (Save as Demo Fixture on a real generated demo-org proposal)"
    why_blocking: "demo_fixtures is EMPTY. demo-run-start has only ever returned 400 no active demo fixture. Reqs 2, 3, 4, 5, 7, 8 cannot be observed until this exists."
  - id: PREREQ-2
    what: "Upload the canonical Storage object {demoOrgId}/demo/canonical-demo-rfp.pdf to the documents bucket"
    why_blocking: "demo-run-start materializes proposal_documents pointing at this shared path (DEMO_RFP_STORAGE_PATH, demo-run-start/index.ts:43). The object does not exist, so the document-extraction step would surface a broken reference."
human_verification:
  - test: "Run the 10-step end-to-end presenter script in 16-09-SUMMARY.md after clearing PREREQ-1 and PREREQ-2"
    expected: "Steps 3, 4-6, 8-9 and 10 clear the deferred live verifications owed by 16-03, 16-04, 16-09 and 16-05 respectively — four plans' worth in one session"
    why_human: "Requires a browser session, a super_admin login, a real file upload and two concurrent tabs. No static check substitutes for observing a demo run."
  - test: "Push the 46 local commits and confirm Netlify prod serves /demo behind SuperAdminRoute"
    expected: "The /demo route renders for super_admin only and 404s/redirects otherwise"
    why_human: "Frontend is unpushed; prod deployment state cannot be verified from the working tree."
deferred:
  - truth: "demo_* RLS policies carry an org predicate matching their table comments"
    addressed_in: "Backlog / follow-up"
    evidence: "WR-03 in 16-REVIEW.md — KNOWINGLY DEFERRED, not missed. Policies are role-only (super_admin); mutations are service-role-only so the practical exposure is read-visibility of fixtures across orgs to super_admins, who already have global read."
---

# Phase 16: Token-Free Demo Mode — Verification Report

**Phase Goal:** A super_admin can drive a complete, deterministic proposal demo with zero live model calls.

## Overall Verdict — read this whole paragraph

**Phase 16 is fully coded, reviewed, and its backend is deployed and active in production — and the demo has never been run.** Not once. `demo_fixtures` is empty, the canonical RFP Storage object does not exist, and `demo-run-start` has only ever returned `400 no active demo fixture`. Every requirement below is at best **IMPLEMENTED, UNVERIFIED**, with exactly one exception. The headline claim — "a demo runs with zero model calls" — is structurally supported by code review, a mutation-verified Req 6 fence and a zero-provider-reference scan, but **has never been observed running**. Do not read this report as "phase complete."

**"Implemented and reviewed" is a strictly weaker claim than "observed working."** This report keeps those two categories separate everywhere. Seven of nine requirements sit in the weaker category.

## Deployment State

| Layer | State | Evidence |
| --- | --- | --- |
| DB objects (5 tables, clone RPC, demo org flag) | DEPLOYED | migrations `20260721000001`–`20260721000004`; schema drift clean |
| `demo-capture-fixture`, `demo-run-start`, `demo-reset` | DEPLOYED + ACTIVE | 16-03/04/05 SUMMARYs |
| `demo-run-sweep` pg_cron job `'0 * * * *'` | DEPLOYED + ACTIVE | 16-06-SUMMARY |
| Frontend (`/demo`, capture button, reset control) | COMMITTED, **NOT PUSHED** | 46 commits in `origin/master..HEAD`; Netlify prod does not have it |
| Test suite | 505 passed / 16 skipped / 0 failed; build green | 16-REVIEW.md |

## Per-Requirement Verdicts

| # | Requirement | Verdict | Evidence supporting the verdict |
| --- | --- | --- | --- |
| 1 | Server-side super_admin gate on all demo functionality | **IMPLEMENTED, UNVERIFIED** | All three fns import `getAuthedUserAndOrg` and re-read role from `user_profiles`; `demo-reset/index.ts:91` returns `403 super_admin required`. JWT-only identity, body ignored. Unit tests cover the predicate. **No crafted `admin`/`user`/anonymous request has been fired at a deployed endpoint.** |
| 2 | Fixture capture tool (versioned) | **IMPLEMENTED, UNVERIFIED** | `demo-capture-fixture` deployed; monotonic-version + archive-then-promote logic present; WR-fix `4d677da` keeps an active fixture when promote fails after archive. **16-03-SUMMARY:158 explicitly says "No end-to-end capture has been run… do not read as passed."** Five `ignore:true` stubs enumerate what is owed. |
| 3 | Demo RFP goes through the real ingest pipeline (genuine embeddings, cloned per run) | **IMPLEMENTED, UNVERIFIED — genuinely at risk** | `clone_demo_fixture_chunks` RPC deployed and called at `demo-run-start/index.ts:456`; capture snapshots `chunks` with embeddings. **But nothing has ever been ingested:** no demo RFP has passed through `extract-document`, so no fixture chunk with a real 1536-dim embedding has ever existed. This is the only requirement whose *substance* (embeddings are genuine, retrieval returns real citations) rests entirely on an unexecuted data step, not just an unobserved code path. See Risks. |
| 4 | Presenter-facing demo run flow | **IMPLEMENTED, UNVERIFIED** | `DemoRunSurface.tsx` + `useDemoRun.ts` routed at `/demo` behind `SuperAdminRoute` (`App.tsx:69`); paced sequential reveal, no fake streaming; template locked to default; upload control locked (WR-05 fix). **Never driven in a browser.** Frontend also unpushed. |
| 5 | Fresh, isolated proposal per run | **IMPLEMENTED, UNVERIFIED** | Run-scoped `demo_runs` row, `created_by`=caller, fresh `proposals` row per invocation; run-scoped (not account-inferred) reset per D-10. **Concurrency isolation is step 10 of the 16-09 script and has never been executed** — two-tab independence is asserted by design, not observed. |
| 6 | Post-generation is indistinguishable and unbranched | **IMPLEMENTED — strongest non-live evidence in the phase** | `src/__tests__/no-demo-branch-below-population.test.ts` is a *mutation-verified* fence (commit `dc8c87d`): it fails when a demo branch is introduced below the population step. Backed by a zero-provider-reference scan. This is a static invariant, so a passing fence is close to dispositive — but the behavioural half ("behaves identically on a demo proposal and a real draft") is still unobserved. |
| 7 | Fixture validation before a run | **IMPLEMENTED, UNVERIFIED** | Pure module `_shared/demoFixtureValidation.ts` + `src/lib/demoFixtureValidation.ts` with unit coverage; role normalization mismatch found and fixed (`07b08cb`). **Abort-on-drift has never been triggered against a real template + real fixture.** |
| 8 | Reset deletes the demo proposal, returns to pre-upload in-session | **IMPLEMENTED, UNVERIFIED** | `demo-reset` deployed with triple-guard; `_shared/demoRunCleanup.ts` is the single teardown impl shared with the sweep; `source_document` NO-ACTION FK fix (`d93de75`); `DemoResetControl.tsx` returns in-session with no reload; vestigial global "Reset Demo" button and both stale labels removed (grep confirms zero `sessionStorage.clear`/"Reset Demo" remaining in `Sidebar.tsx`/`ProposalContentsSidebar.tsx`). Tests assert the canonical file is never referenced by any teardown path. **No reset has ever been performed.** |
| 9 | Demo proposals stay draft and are swept | **PARTIAL — sweep half VERIFIED LIVE; draft-floor half UNVERIFIED** | **The one genuine live verification in this phase:** a real non-dry `sweep_abandoned_demo_runs(50, false)` ran against production with 66 proposals and 38 `proposal_documents` present and correctly swept nothing — guards exercised against real client data, not an empty table. `min(uuid)` (no such aggregate in Postgres) was caught here; it was breaking the sweep on **every** hourly call. Cron job active. The other half (a demo proposal's chunks never leak into another proposal's retrieval; nothing flips a demo proposal off `draft`) is argued from code, unobserved. **Deliberate SPEC deviation:** implemented as pg_cron PL/pgSQL, not a scheduled edge function; 16-06-SUMMARY:68-73 shows Req 9's sole justification for an edge function (Storage-object deletion) is void because SPEC:198/D-06 forbids deleting the shared canonical file — there are zero per-run Storage objects to remove. Accepted deviation. |

**Counts:** IMPLEMENTED AND VERIFIED LIVE 1 (Req 9, sweep half) · IMPLEMENTED, UNVERIFIED 7 · PARTIAL 1 (Req 9 overall) · MISSING 0.

## Execution Quality Signal

Seven real defects were found and fixed *during* execution, every one in a failure path the unit tests structurally could not reach:

1. Zero-active-fixtures window on promote failure (16-03)
2. Blank-section role-normalization mismatch (16-04)
3. `NO ACTION` `source_document` FK blocking teardown (16-05)
4. `min(uuid)` — no such aggregate in Postgres — breaking the sweep on **every** hourly call (16-06)
5. `extract-assumptions` firing a live model call on every demo run (would have voided the phase's core claim)
6. Stranded untrackable draft on rollback (WR-01/02)
7. Unlocked upload control on the demo surface (WR-05)

This is a strong signal about the *quality* of what was built. It is not a substitute for running it.

## Code Review Disposition (16-REVIEW.md)

0 critical · 5 warning · 3 info. Four findings fixed in `3384c53` (WR-01/02 stranded-draft leak + unchecked rollback errors; WR-04 flag-or-slug consistency; WR-05 unlocked upload control). **WR-03 (demo_* RLS is role-only with no org predicate, while table comments claim demo-org-scoped) is KNOWINGLY DEFERRED, not missed.**

## Blocking Human Prerequisites

Two data/live-ops steps that no agent can clear:

1. **Capture the first fixture via the 16-07 UI** — generate a real proposal in the demo org, then use the super_admin "Save as Demo Fixture" action on `ProposalDetail`. Until this exists, `demo_fixtures` is empty and `demo-run-start` returns `400 no active demo fixture`.
2. **Upload the canonical RFP** to `{demoOrgId}/demo/canonical-demo-rfp.pdf` in the `documents` bucket.

Once both are cleared, **the 10-step end-to-end script in `16-09-SUMMARY.md` clears four plans' deferred verifications (16-03, 16-04, 16-05, 16-09) in a single session.** Steps 3, 4-6, 8-9 and 10 map to those plans respectively.

A third, independent step: **push the 46 local commits** so prod has the frontend.

## Genuinely At Risk vs Merely Unobserved

Most of the unverified surface is *merely unobserved* — deployed, reviewed, unit-tested code on paths that should work. Two items are different:

- **Req 3 (real embeddings / real retrieval) — AT RISK.** Its substance depends on a data step that has never run. Whether cloned chunks yield real RFP-derived and regulatory citations post-generation is genuinely unknown, and a failure here would be a *content* failure the presenter sees mid-demo, not a 500. Verify explicitly at step 8 of the 16-09 script.
- **Req 9 draft-floor half — LOW RISK BUT UNPROVEN.** The claim "no code path flips a demo proposal off draft" is a negative, argued from a code search. It is likely true and cheap to re-check, but nothing enforces it structurally the way the Req 6 fence enforces its invariant.

Everything else (Reqs 1, 2, 4, 5, 7, 8) is unobserved rather than at risk.

---

_Verified: 2026-07-21_
_Verifier: Claude (gsd-verifier)_
