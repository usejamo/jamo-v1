---
phase: 16-token-free-demo-mode
plan: 08
subsystem: demo-presenter-surface
tags: [demo, wizard, req-4, req-6, frontend]
requires:
  - "demo-run-start edge function (16-04, deployed)"
  - "demo org + presenter account (16-02, live)"
  - "SaveAsDemoFixtureButton / demo-capture-fixture (16-07) to fill demo_fixtures"
provides:
  - "useDemoRun — demo driver: starts a run, adopts the server proposal_id, paces the reveal"
  - "DemoRunSurface — presenter entry point reusing the real wizard, routed at /demo"
  - "Step4Generate demoMode — standard-template pre-select + hard lock (D-02)"
  - "no-demo-branch-below-population.test.ts — Req 6 invariant fence"
  - "src/lib/demoOrg.ts, src/lib/invokeError.ts, src/lib/wizardReducer.ts — shared modules"
affects:
  - "16-09 (reset control) consumes useDemoRun's demoRunId + reset()"
tech-stack:
  added: []
  patterns:
    - "Mutation-verified structural fence (extends the 16-06 demoSweepParity precedent)"
    - "Demo-specific behaviour expressed as SEEDED STATE handed to a shared component, never a branch inside it"
key-files:
  created:
    - src/__tests__/no-demo-branch-below-population.test.ts
    - src/hooks/useDemoRun.ts
    - src/components/demo/DemoRunSurface.tsx
    - src/components/__tests__/DemoRunSurface.test.tsx
    - src/lib/demoOrg.ts
    - src/lib/invokeError.ts
    - src/lib/wizardReducer.ts
  modified:
    - src/components/wizard/Step4Generate.tsx
    - src/components/SaveAsDemoFixtureButton.tsx
    - src/components/ProposalCreationWizard.tsx
    - src/App.tsx
decisions:
  - "Population happens IN the demo surface, then navigation omits ?generate=true — the proposal page opens through its ordinary already-generated path"
  - "extractionStatus seeded 'complete' at run adoption to disarm Step2's live extract-assumptions trigger, instead of branching inside Step2"
  - "Demo run surface routed at /demo (deviation: App.tsx not in any Phase 16 plan's file list)"
metrics:
  duration: ~45 min
  tasks: 3
  files: 11
  completed: 2026-07-21
---

# Phase 16 Plan 08: Presenter Run Surface & Req 6 Fence Summary

A super_admin in the demo org can drive the **real** creation wizard from `/demo`: one click mints an isolated demo-org draft via the deployed `demo-run-start`, the fixture's document and assumptions appear in the real Step2/Step3, the standard template is pre-selected and hard-locked in Step4, and the already-written sections reveal one at a time on a 350 ms timer with no generation call and no simulated streaming — while an automated, mutation-verified fence proves no demo-aware conditional exists anywhere below the population step.

## What was built

**Task 1 — Req 6 fence** (`src/__tests__/no-demo-branch-below-population.test.ts`, 10 cases).
Reads the committed bytes of the five below-population paths named by SPEC Req 6
(`generate-proposal-section`, `retrieve-context`, `chat-with-jamo`, `section-ai-action`,
`exportDocx`) plus the client-side regeneration/chat paths (`useProposalGeneration`,
`AIChatPanel`), and additionally sweeps **every module** in those four edge-function
directories so a branch hidden in a helper is caught, not just one in `index.ts`.
It also asserts each fenced path still exists, so a rename cannot silently empty the fence.

**Task 2 — driver + surface.** `useDemoRun` invokes `demo-run-start` with the standard
template, **adopts the returned `proposal_id`** (never mints a second draft — the wizard's
eager step-1 `createProposal` is deliberately not on this path), reads back the
server-materialized assumptions, exposes `demoRunId` for 16-09's reset control, and paces
the reveal by dispatching `SECTION_COMPLETE` per row into the **real** `generationReducer`.
`DemoRunSurface` mounts the **real** `Step2DocumentUpload` / `Step3AssumptionReview` /
`Step4Generate`, gated on `super_admin` **and** own-org-is-demo-org resolved at runtime.

**Task 3 — D-02 lock + tests.** `Step4Generate` gained `demoMode`: it forces the
`is_default` template and renders every card `aria-disabled` / `pointer-events-none` with
**no `onClick` at all**. 12 new cases cover the lock, the gate, run start, the reveal and
the zero-model-call invariant.

## The Req 6 boundary — how it is actually held

Nothing below population knows a demo is happening, and two design choices are what make
that true rather than aspirational:

1. **Population runs inside the demo surface**, then navigation goes to `/proposals/:id`
   **without** `?generate=true`. That query flag is what makes `ProposalDetail` start a real
   generation; omitting it means the proposal page opens in exactly the state a finished
   real draft opens in. The alternative — navigating with a demo flag and branching in
   `ProposalDetail` — would have put a conditional below the boundary.
2. **Demo behaviour is expressed as seeded state, not as a branch.** See the
   `extract-assumptions` finding below.

### Fence verified non-vacuous

A demo branch was temporarily injected into **two** files and the suite was run:

| Probe | Injected into | Result |
|---|---|---|
| `p.is_demo_org ? [] : null` | `supabase/functions/retrieve-context/index.ts` | named-path test **failed**, naming file + line |
| `ctx.demo_run_id` | `supabase/functions/chat-with-jamo/rag.ts` | caught **only** by the directory sweep — the named-path list alone would have missed it |

Both probes were then reverted (`git checkout --` on each specific file) and the fence
returned green. The `rag.ts` result is the reason the directory sweep exists.

The mutation run also exposed a **real hole in the first version of the pattern**:
`/\bdemo_run\b/` does **not** match `demo_run_id`, because `_` is a word character. The
obvious both-ends-bounded regex would therefore have missed `demo_run_id`,
`demo_fixture_sections` and `is_demo_org` — the exact identifiers the demo tables use. The
pattern is now `/\b(is_demo|demo_run|demo_fixture|demoMode)\w*/`, with guard-the-guard cases
asserting it rejects each of those and still accepts innocent prose (`demonstrates`).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] A demo run would have fired a live `extract-assumptions` call**
- **Found during:** Task 2, reading `Step2DocumentUpload` before reusing it.
- **Issue:** Step2 invokes `extract-assumptions` (a live Anthropic call) whenever its
  documents are all `parse_status='complete'` **and** `extractionStatus === 'idle'`.
  `demo-run-start` materializes the RFP document row *already parsed*, so mounting the real
  Step2 in a demo run would have spent a model call **every run** — breaking the phase's
  central zero-model-call invariant — and overwritten the fixture's assumptions with freshly
  extracted ones, destroying determinism.
- **Fix:** the driver seeds `SET_EXTRACTION_STATUS: 'complete'` when adopting the run, so the
  trigger is disarmed by the state handed to the step. **No branch was added to Step2** —
  the fix lives above the population boundary, in what the demo materializes.
- **Files:** `src/hooks/useDemoRun.ts`
- **Verified:** mutation-tested. Removing the seed makes
  `never invokes extract-assumptions during a demo run` fail with `extract-assumptions` in
  the invoke list. The first draft of that test was **vacuous** (the document mock was an
  empty list, so the trigger never armed); the mock now carries a parsed row, which is the
  real post-run state.
- **Commit:** `d463956`

**2. [Rule 2 — Missing safeguard] Blank-section reveal refused (Req 7 defence in depth)**
- The driver aborts with an error naming the offending section(s) rather than revealing an
  empty card. `demo-run-start` already validates fixture-vs-template before its first write,
  so this should be unreachable — but "never render a blank section mid-demo" is the
  requirement, and a silent empty card in front of a customer is the failure mode.
- **Commit:** `d463956`

### Structural deviations

**3. Shared modules extracted** (`src/lib/demoOrg.ts`, `src/lib/invokeError.ts`).
Per the carry-forward instruction: `resolveIsDemoOrg` and `extractInvokeErrorMessage` moved
out of `SaveAsDemoFixtureButton.tsx` now that a second caller exists, with 16-07's imports
updated in the same commit. `extractInvokeErrorMessage` gained a caller-supplied fallback so
it is no longer capture-specific. **Commit:** `8b9d2db`

**4. `wizardReducer` moved to `src/lib/wizardReducer.ts`** (verbatim, no behaviour change).
The plan assumed the demo would drive the wizard's reducer, but it lived inside
`ProposalCreationWizard.tsx`; importing it from there would have dragged the modal, router
and proposals contexts plus all four step components into a hook. `ProposalCreationWizard.tsx`
is not in this plan's `files_modified`; the edit is a one-line import swap. **Commit:** `8b9d2db`

**5. Route added at `/demo`** — `src/App.tsx`, not in **any** Phase 16 plan's file list.
Without it the surface is unreachable, which would make 16-09's end-to-end presenter
verification impossible and leave this plan's stated goal unmet. Mirrors the 15-11 `/admin`
precedent exactly: nested inside `ProtectedRoute` (so an unauthenticated user still lands on
`/login` first), then `SuperAdminRoute`, then `Layout` so the demo runs in the real app
chrome. **Commit:** `c4030b9`

**6. `mounting the surface calls demo-run-start` inverted.** The plan's acceptance wording
was that *mounting* invokes run-start. Implemented and tested the opposite: mounting must
**not** invoke it (otherwise every visit to `/demo` mints an abandoned demo draft for the
sweep to clean up), and the presenter's "Add demo RFP" click does. Both directions are
asserted.

## Verification

| Check | Result |
|---|---|
| `npm run test:run -- no-demo-branch-below-population` | 10 passed |
| `npm run test:run -- DemoRunSurface` | 12 passed |
| `npm run test:run` (full suite) | **492 passed / 16 skipped / 0 failed** (was 470/16/0; +22) |
| `npm run build` | green |
| `npx tsc --noEmit` | 19 pre-existing non-test errors, **none in files touched by this plan** |

Mutation checks (each reverted afterwards):

| Mutation | Expected failure | Observed |
|---|---|---|
| demo branch in `retrieve-context/index.ts` | Req 6 fence | failed |
| demo branch in `chat-with-jamo/rag.ts` | Req 6 fence (sweep only) | failed |
| `onClick` restored on locked template cards | D-02 lock test | failed |
| seeded `extractionStatus` removed | zero-model-call test | failed |

## Known Stubs

None. The surface is complete and routed; what it cannot yet *do* is a data prerequisite,
not an unimplemented code path (see below).

## What a human must do to exercise this

1. **Capture the first fixture.** `demo_fixtures` is still empty, so `demo-run-start` returns
   `400 no active demo fixture for the standard template` for every call. This is the correct
   pre-capture response, not a defect — the surface renders it as the edge function's own
   message with the start control still available. Clearing it requires signing in as the
   demo-org presenter, creating a demo-org proposal, ingesting the canonical RFP through the
   real `extract-document` pipeline, running a **full real generation to completion**, then
   clicking **Save as demo fixture** (16-07).
2. **Upload the canonical RFP object** `{demoOrgId}/demo/canonical-demo-rfp.pdf` (open since
   16-04). Without it a run creates correct DB rows and the wizard advances, but the document
   row in Step2 points at a missing file and the download 404s mid-demo. This is visible on
   *this* surface, because the reused Step2 renders the real `DocumentList`.
3. **Navigate to `/demo`** as the demo-org presenter. A super_admin outside the demo org sees
   nothing (and would be 403'd server-side anyway).

Frontend-only plan: nothing was deployed, no migration was applied, the live project was not
touched.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change was
introduced; the only new surface is a client route whose three gates (route guard, own-org
check, server gate) are all pre-existing.

## Self-Check: PASSED
