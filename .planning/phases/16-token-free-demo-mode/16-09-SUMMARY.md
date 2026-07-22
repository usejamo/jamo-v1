---
phase: 16-token-free-demo-mode
plan: 09
subsystem: demo-presenter-reset
tags: [demo, reset, req-8, frontend, checkpoint-open]
requires:
  - "demo-reset edge function (16-05, deployed, verify_jwt true)"
  - "useDemoRun / DemoRunSurface (16-08)"
provides:
  - "DemoResetControl — modeless, run-scoped reset wired to demo-reset"
  - "useDemoRun.resetToStart() — in-session return to the add-RFP start (D-11)"
affects:
  - "Phase 16 close-out: this is the last of 9 plans; Wave 4 complete"
tech-stack:
  added: []
  patterns:
    - "Two-step confirm on an irreversible mid-call destructive action"
    - "Local state cleared only AFTER the server confirms the delete"
    - "Acceptance-grep tokens kept out of explanatory prose so the fence stays meaningful"
key-files:
  created:
    - src/components/demo/DemoResetControl.tsx
    - src/components/__tests__/DemoResetControl.test.tsx
  modified:
    - src/hooks/useDemoRun.ts
    - src/components/demo/DemoRunSurface.tsx
decisions:
  - "useDemoRun.reset renamed resetToStart (plan acceptance greps that name; no other caller existed)"
  - "Two-step confirm added — the delete is irreversible and happens mid-presentation"
  - "Task 3 (live presenter E2E) left OPEN as a deferred human-verify checkpoint; it is blocked on two data prerequisites no agent can clear"
metrics:
  duration: ~35 min
  tasks: 2 of 3 (task 3 = open human-verify checkpoint)
  files: 4
  completed: 2026-07-21
---

# Phase 16 Plan 09: Run-Scoped Demo Reset Summary

The presenter can reset a demo run mid-call from inside `/demo`: one control, one behavior — it invokes the deployed `demo-reset` with **the `demo_run_id` this session started** and, only after the server confirms, returns the surface to "Add demo RFP" entirely in-session with no page reload. **The reset path has never been executed against the live edge function** (see the open checkpoint below); everything green here is unit-level against a mocked supabase client.

## What was built

**Task 1 — `src/components/demo/DemoResetControl.tsx`** (commit `2883fb7`).
Invokes `supabase.functions.invoke('demo-reset', { body: { demo_run_id } })` with the id supplied by
the driver, surfaces the server's own message via the shared `extractInvokeErrorMessage`, and calls
`onReset()` only on success. Mounted **only** inside `DemoRunSurface`, in the run-meta header, and
only while `run` is non-null — never in the global Sidebar (the vestigial Sidebar button was deleted
in 16-07). `useDemoRun.reset` renamed `resetToStart` and its contract documented: it bumps the reveal
generation (stopping an in-flight paced reveal for a run that no longer exists), dispatches the real
wizard and generation reducers to `RESET`, and clears `run`.

**Task 2 — `src/components/__tests__/DemoResetControl.test.tsx`** (commit `8dd0137`, 8 cases).
Asserts the invoke target is `'demo-reset'`; that the body carries the exact `demo_run_id` prop
(including a second case with a *different* id, so a hardcoded or inferred value would fail); that
nothing is sent before the confirm; that `resetToStart` fires on success and **not** on a server
refusal or a thrown failure; that the in-flight confirm is disabled and sends exactly once; and that
`window.location.reload` is never called. The reload spy is **wired-checked** (`expect(window.location.reload).toBe(reloadSpy)`)
so the no-reload assertions cannot pass vacuously — that is precisely how D-11 would rot back in.

## The three design points this plan is actually about

1. **D-10 — run-scoped, not account-scoped.** The demo login is shared. Two presenters can hold two
   live runs at the same moment, so "reset my current run" is ambiguous and could delete the other
   presenter's demo mid-sentence. The control forwards the session's own `run.demoRunId`; it never
   infers one. The id is untrusted — `demo-reset`'s server-side triple guard (demo org + `status='draft'`
   + `demo_runs` membership) is the boundary. This component is a courier, not a gate.
2. **D-11 — in-session return.** The old pattern cleared sessionStorage and forced a full page reload,
   which deleted nothing server-side and cost an entire app boot (plus re-auth risk) in front of an
   audience. `onReset` dispatches back to step 1 instead.
3. **D-12 — one behavior.** No modes, no bulk option. Bulk cleanup of abandoned runs is the 16-06
   scheduled sweep's job. A presenter control that could wipe other runs is a live-demo hazard.

## Deviations from Plan

**1. [Structural] `useDemoRun.reset` renamed to `resetToStart`.**
The plan's acceptance criterion greps `resetToStart` in `src/hooks/useDemoRun.ts`; 16-08 shipped the
function as `reset`. `DemoRunSurface` did not destructure it and no test referenced it, so the rename
was a pure, zero-risk clarification — and `resetToStart` is the more honest name (it returns to the
start; it does not delete anything). Commit `2883fb7`.

**2. [Rule 2 — missing safeguard] Two-step confirm added.**
The plan specifies "a single button". A single-click, irreversible hard-delete on the surface a
presenter is actively demoing from is a live-call hazard: one stray click destroys the run in front
of a customer. The control now arms a confirm (`Reset demo` → `Delete and start over` / `Cancel`)
and sends nothing until confirmed. This does not add a *mode* — there is still exactly one behavior
(reset THIS run); it adds an arming step to a destructive action. Commit `2883fb7`.

**3. [Rule 1 — bug in my own first draft] Acceptance-grep token appeared in prose.**
My explanatory comments in both `DemoResetControl.tsx` and `useDemoRun.ts` originally contained the
literal string `window.location.reload` while describing the pattern being replaced — which made
`grep -q "window.location.reload"` match on both files and defeated the D-11 acceptance fence
(T-16-32). Comments reworded to describe the pattern without the token, with an in-file note saying
why. Both files now grep clean. Same class of issue as the 15-05 `inviteUserByEmail` and 15-06
`org_id: body` precedents already recorded in STATE.md Active Decisions. Commit `8dd0137`.

## Verification

| Check | Result |
|---|---|
| `npm run test:run -- DemoResetControl` | 8 passed |
| `npm run test:run -- DemoResetControl DemoRunSurface` | 20 passed |
| `npm run test:run` (full suite) | **500 passed / 16 skipped / 0 failed** (was 492/16/0; +8) |
| `npm run build` | green |
| `grep "functions.invoke('demo-reset'" DemoResetControl.tsx` | 1 match |
| `grep "demo_run_id" DemoResetControl.tsx` | 3 matches |
| `grep "resetToStart" useDemoRun.ts` | 2 matches |
| `grep "window.location.reload" DemoResetControl.tsx useDemoRun.ts` | **0 matches** (D-11) |

Frontend-only plan: nothing was deployed, no migration applied, the live project was not touched.

---

## OPEN CHECKPOINT — Task 3: live presenter end-to-end verification (NOT PERFORMED)

**Status: open and deferred.** Recorded the same way Phase 15 plans 09 and 10 recorded theirs.

Say this plainly, because the green numbers above invite the opposite reading:

- **No live reset has ever been performed.** Not once, not partially.
- **The tests are unit-level.** `supabase` is mocked in-module (`vi.mock('../../lib/supabase')`); no
  HTTP request leaves the test process. They prove the control *composes the right call* and
  *sequences its local state correctly*. They prove nothing about the deployed function's behavior.
- **The reset path is unexercised against the deployed `demo-reset`.** Whether the triple guard
  admits a legitimate run, whether the teardown actually removes `proposal_documents` and
  `document_extracts`, whether the shared canonical RFP object survives, and whether concurrent runs
  stay isolated are all **unproven**. `demo-reset/test.ts` still carries 8 `ignore: true` stubs for
  exactly these.

**Why it cannot be cleared by an agent — two data prerequisites:**

1. **`demo_fixtures` is empty.** `demo-run-start` returns `400 no active demo fixture` for every call,
   so no run exists to reset. Capturing the first fixture requires a human signed in as the demo-org
   presenter running a full real generation and clicking **Save as demo fixture** (16-07 UI).
2. **The canonical Storage object `{demoOrgId}/demo/canonical-demo-rfp.pdf` does not exist.** Until
   uploaded, a run creates correct DB rows but the RFP download 404s mid-demo.

Neither was faked, stubbed, or worked around.

### END-TO-END VERIFICATION SCRIPT (covers the whole phase, not just this plan)

Log in at `localhost:5173` as the demo-org super_admin presenter (`DEMO_PRESENTER_EMAIL` / `DEMO_PRESENTER_PASSWORD` in `.env`).

1. **Upload the canonical RFP** to Storage `documents/{demoOrgId}/demo/canonical-demo-rfp.pdf` (org
   id prefix is required — the `documents` bucket's RLS keys on the first path segment).
   *Failure looks like:* wrong path — every run's RFP download 404s later while the DB rows still
   look perfectly correct. Nothing will tell you at upload time.
2. **Generate one real proposal in the demo org** through the ordinary wizard. This one costs tokens;
   it is the seed the whole token-free path is replayed from.
   *Failure looks like:* any section left ungenerated — capture will refuse it by name in step 3.
3. **Click "Save as demo fixture"** on that proposal (button appears beside the status selector).
   Expect the inline status `Captured as fixture v1`.
   *Failure looks like:* `source proposal has ungenerated section(s): <names>` (go back to step 2),
   `source proposal has no selected_template_id`, or a 403 (you are signed in as the wrong
   super_admin — the Phase-15 internal account is org-scoped out).
4. **Go to `/demo` → click "Add demo RFP".** Expect the meta line
   `Fixture v1 · N sections · N assumptions · N indexed RFP chunks`.
   *Failure looks like:* `no active demo fixture for the standard template` — **before step 3 this is
   the CORRECT response, not a bug**; after step 3 it means the capture did not land. A 422 naming a
   section means the fixture and the current template have drifted (Req 7 working as designed).
5. **Walk the wizard.** Assumptions should be pre-populated and approved; the standard template
   pre-selected and **not clickable**; Generate reveals sections one at a time at ~350 ms with no
   character-by-character streaming.
   *Failure looks like:* a blank section card (Req 7 breach — should be unreachable, the driver
   aborts by name instead), a clickable template picker (D-02 breach), or text typing itself in.
6. **Confirm ZERO model calls.** Query `usage_events` for the run's time window and for this
   `proposal_id`. Expect no rows.
   *Failure looks like:* any row at all. The most likely culprit is `extract-assumptions` firing from
   Step2 — the exact bug 16-08 fixed by seeding `extractionStatus='complete'`. A row here means that
   seed regressed.
7. **Open the proposal → run one chat query and one section rewrite.** Expect genuine RFP citations
   and regulatory citations, behaving exactly like a real draft.
   *Failure looks like:* citation-free answers (RFP chunks did not clone — check `rfp_chunks` count
   in step 4's meta line), or `placeholder not found` on a rewrite.
8. **Click "Reset demo" → "Delete and start over".** Expect the surface to return to "Add demo RFP"
   with no page flash and no re-auth.
   *Failure looks like:* a red inline alert carrying the server's own message —
   `reset refused: not a resettable demo run` (a guard leg failed: the run's proposal is not draft,
   not in the demo org, or has no `demo_runs` row), `404 demo run not found`, or
   `403 demo reset is only permitted from the demo org`. A visible full-page reload would be a D-11
   regression.
9. **Verify cleanup via Supabase MCP.** The proposal row is gone; its sections/assumptions/chunks are
   gone by cascade; and critically
   `select count(*) from proposal_documents where proposal_id is null and org_id = <demo org>`
   **did not grow**. Confirm the Storage object from step 1 still exists.
   *Failure looks like:* that count growing by one — orphaned document rows (SPEC Pitfall 1, the
   `SET NULL` FK). A missing Storage object means a teardown path deleted the shared canonical file,
   which no path is permitted to do.
10. **Open two tabs and start a run in each.** Expect two distinct `proposal_id`s. Reset tab A and
    confirm tab B's run is untouched and still openable.
    *Failure looks like:* both tabs sharing one proposal (Req 5 breach), or resetting A killing B
    (the D-10 account-inferred-run failure this plan exists to prevent).

Steps 3, 4–6, 8–9 and 10 respectively clear the deferred live verifications owed by **16-03**,
**16-04**, **16-09** and **16-05**.

## Known Stubs

None in this plan's code. The open item above is a data/live-ops prerequisite, not an unimplemented
code path.

## Threat Flags

None. No new endpoint, auth path, file access pattern or schema change. The only new surface is a
client-side caller of an already-deployed, already-guarded edge function.

## Self-Check: PASSED
