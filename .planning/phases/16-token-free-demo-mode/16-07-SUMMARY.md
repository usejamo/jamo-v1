---
phase: 16-token-free-demo-mode
plan: 07
subsystem: frontend
tags: [react, vitest, super-admin-gate, demo-capture, dead-code-removal, error-surfacing]

# Dependency graph
requires:
  - phase: 16-token-free-demo-mode
    plan: 03
    provides: demo-capture-fixture edge fn (deployed, verify_jwt) — the invoke target and the authoritative gate
  - phase: 16-token-free-demo-mode
    plan: 02
    provides: the jamo-demo org (feature_flags.is_demo = true) — resolved at runtime, never hardcoded
provides:
  - src/components/SaveAsDemoFixtureButton.tsx — the capture entry point (D-04), super_admin + demo-org gated
  - The first UI able to populate demo_fixtures, which unblocks end-to-end verification of 16-03/16-04/16-05
  - extractInvokeErrorMessage() — reads the edge fn's own message off FunctionsHttpError.context
  - Removal of the vestigial pre-Supabase demo controls (D-09)
affects: [16-08, 16-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "supabase-js collapses every non-2xx edge response into 'Edge Function returned a non-2xx status code'; the actionable text must be read from error.context.json().error or the server's precise 400/403 is thrown away"
    - "A super_admin-only affordance is still not safe to gate on 'is a super_admin' when more than one super_admin exists — gate on the caller's own org, resolved at runtime"
    - "Extract a gated action into its own component when the host page cannot be mounted in a test; the gate is then actually tested rather than asserted by grep"
    - "Delete dead controls in the same plan that introduces their real replacement path, so the two are never live simultaneously"

key-files:
  created:
    - src/components/SaveAsDemoFixtureButton.tsx
    - src/components/__tests__/SaveAsDemoFixture.test.tsx
  modified:
    - src/pages/ProposalDetail.tsx
    - src/components/Sidebar.tsx
    - src/components/ProposalContentsSidebar.tsx

decisions:
  - "Extracted the capture action into SaveAsDemoFixtureButton.tsx rather than inlining it in ProposalDetail.tsx (plan Task 3's stated escape hatch) — ProposalDetail mounts TipTap, four contexts and useProposalGeneration, so an inline action would be verifiable only by grep, never by test"
  - "Added a runtime demo-org gate on top of the plan's role-only gate, per the phase-wide rule that the demo org is resolved via feature_flags.is_demo / the jamo-demo slug and never hardcoded"
  - "Surfaced the edge function's own error text verbatim (including 'ungenerated section(s): <names>') rather than mapping to friendly copy — the presenter needs the section name to fix the capture"
  - "Removed the ProposalContentsSidebar footer div entirely; it held nothing but the demo label"

metrics:
  duration: ~35min
  tasks_completed: 3
  files_created: 2
  commits: 3
  completed: 2026-07-21
---

# Phase 16 Plan 07: Demo Fixture Capture Entry Point Summary

A super_admin-only "Save as demo fixture" action on the proposal detail page that invokes the deployed `demo-capture-fixture` edge function and reports the allocated fixture version — the first UI capable of writing a `demo_fixtures` row, which is what unblocks end-to-end verification of the rest of the phase. The vestigial `sessionStorage`-clearing "Reset Demo" control and both `jamo Demo v0.1.0` labels are gone.

## What Was Built

### Task 1 — Capture action (commit `2d20d54`)

`src/components/SaveAsDemoFixtureButton.tsx`:

- **Gate (cosmetic).** Renders `null` unless `role === 'super_admin'` **and** the caller's own `org_id` resolves as the demo org. Resolution is a runtime lookup of `organizations.slug` / `feature_flags.is_demo` — no UUID is hardcoded anywhere. This matters because two super_admins exist (the demo presenter and the Phase-15 internal account); a role-only gate would show the capture action to the internal account, whose proposals the server would then reject with a 403 the presenter has no way to interpret.
- **Not a boundary.** The component does not duplicate or reimplement any server check. `demo-capture-fixture` re-reads the caller's role from `user_profiles` and asserts the source proposal is demo-org-owned; this UI only decides whether to draw a button.
- **Invoke.** `supabase.functions.invoke('demo-capture-fixture', { body: { source_proposal_id: proposalId } })`, disabled while in flight.
- **Feedback.** Success renders `Captured as fixture v{version}` (`role="status"`). Failure renders the **server's own message** (`role="alert"`).

`src/pages/ProposalDetail.tsx` renders it next to `StatusSelector`/`ProposalReferenceControl`, behind `profile?.role === 'super_admin'`. Nothing on the demo path touches `StatusSelector`, so demo proposals remain `status='draft'` as the retrieval exclusion and the sweep both require.

**The error-surfacing detail is load-bearing.** supabase-js wraps any non-2xx edge response in a `FunctionsHttpError` whose `.message` is the useless generic `"Edge Function returned a non-2xx status code"`; the real body sits on `.context` as an unread `Response`. `demo-capture-fixture` returns exactly the messages a presenter needs to act on — *"source proposal has ungenerated section(s): Budget"*, *"source proposal has no selected_template_id"*, *"capture only permitted for demo-org proposals"*. `extractInvokeErrorMessage()` reads `.context.json().error` and falls back to `.message`, so a failed capture names its own cause instead of saying "something went wrong".

### Task 2 — Vestigial control removal (commit `b34eef3`)

- `Sidebar.tsx`: deleted the `{!collapsed && (<>…</>)}` block holding the `jamo Demo v0.1.0` label and the `onClick={() => { sessionStorage.clear(); window.location.reload() }}` "Reset Demo" button. That button deleted **zero** database rows; leaving it beside the real run-scoped reset (16-09) would be an active hazard during a live demo. The repo owner's wordmark-logo change in the same file was left untouched.
- `ProposalContentsSidebar.tsx`: deleted the footer `<div>` whose only child was the duplicate label.
- No replacement control was added here. The real reset is run-scoped and lives inside the demo run surface (16-09).

### Task 3 — Component test (commit `2c784d6`)

`src/components/__tests__/SaveAsDemoFixture.test.tsx`, 9 tests, inline `vi.mock` (no dynamic import, per the STATE.md OOM note):

- not rendered for `role='user'` / `role='admin'`
- rendered for `role='super_admin'` in the demo org
- **not** rendered for a `super_admin` outside the demo org, nor when the org lookup fails
- rendered when only `feature_flags.is_demo` (not the slug) identifies the org
- invokes `'demo-capture-fixture'` with `{ source_proposal_id }` and renders `Captured as fixture v3`
- surfaces `source proposal has ungenerated section(s): Budget` from the error body, not the generic wrapper
- falls back to `error.message` when there is no server body

## Deviations from Plan

### 1. [Rule 2 — missing critical functionality] Capture action extracted into its own component

- **Found during:** Task 1
- **Issue:** The plan's Task 1 acceptance greps target `src/pages/ProposalDetail.tsx`, but Task 3 requires a mountable unit and explicitly permits extraction. ProposalDetail imports TipTap, `SectionWorkspaceProvider` and `useProposalGeneration` and consumes four contexts — it is not mountable in Vitest, and even importing the module risks the OOM recorded in STATE.md.
- **Fix:** Created `SaveAsDemoFixtureButton.tsx`; ProposalDetail renders it. The plan frontmatter's `artifacts`/`key_links` were updated to point at the real file so verification checks the code that exists rather than a grep-satisfying comment.
- **Files modified:** `src/components/SaveAsDemoFixtureButton.tsx`, `src/pages/ProposalDetail.tsx`, `.planning/phases/16-token-free-demo-mode/16-07-PLAN.md`
- **Commit:** `2d20d54`

### 2. [Rule 2 — missing critical functionality] Runtime demo-org gate added on top of the role gate

- **Found during:** Task 1
- **Issue:** The plan specified `profile?.role === 'super_admin'` alone. With two super_admins in different orgs, that shows the capture action to the internal super_admin, for whom every click 403s.
- **Fix:** Added `resolveIsDemoOrg()` — a runtime `organizations` lookup on `feature_flags.is_demo` / slug `jamo-demo`, consistent with the rule already enforced by tests in `demoSweepParity`, `demoRunCleanup` and `demoFixtureValidation`. No UUID is hardcoded.
- **Commit:** `2d20d54`

### 3. [Rule 2 — missing critical functionality] Edge-function error body extraction

- **Found during:** Task 1
- **Issue:** The plan said "on error surface the message". Surfacing `error.message` alone would have shown the generic supabase-js wrapper text and discarded every precise 400/403 the capture endpoint returns.
- **Fix:** `extractInvokeErrorMessage()` reads `.context.json().error` first, with `.message` as fallback. Covered by two tests.
- **Commit:** `2d20d54`

## Verification

- `npm run test:run -- SaveAsDemoFixture` → **9 passed**
- Full suite → **470 passed / 16 skipped / 0 failed** (65 files passed, 2 skipped) — up from 461/16 by exactly the 9 new tests; nothing regressed
- `npm run build` → succeeds (after Task 1 and again after Task 2)
- `grep -rn "Reset Demo\|jamo Demo v0.1.0\|sessionStorage.clear" src/` → no matches anywhere in `src/`

## Threat Model Compliance

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-16-26 (EoP: non-super_admin using the capture affordance) | mitigated | Component returns `null` for non-super_admins; `demo-capture-fixture`'s service-role role re-read remains the enforcement point (Access-control point 5). The UI gate is documented in-file as cosmetic. |
| T-16-27 (Info disclosure: capturing a real-client proposal) | mitigated | The action is only drawn inside the demo org; the server independently asserts demo-org ownership and 403s otherwise. The UI adds no bypass path. |

No new threat surface: this plan adds no endpoint, no schema change and no auth path.

## Known Stubs

None.

## How to Capture the First Fixture (unblocks the phase)

`demo_fixtures` is still empty — this UI is the tool that fills it, but it needs a human with the presenter credentials:

1. Sign in as the **demo-org super_admin presenter** (not the Phase-15 internal super_admin — the button will not appear for that account, by design).
2. Create a proposal in the demo org and upload the canonical demo RFP, letting the real `extract-document` pipeline run so genuine chunks + embeddings exist.
3. Select the **Standard Proposal** template and run a **full, real generation to completion**. Every section must reach `status='complete'` — capture rejects the proposal by name if any section is ungenerated.
4. Open the proposal detail page. **Save as demo fixture** sits in the metadata row beside the status selector.
5. Click it. Success shows `Captured as fixture v1`. Any failure shows the server's exact reason (e.g. the offending section names) — fix and re-click; re-capture allocates a new version rather than overwriting.
6. Confirm one `demo_fixtures` row (`status='active'`) plus its `demo_fixture_sections` / `_assumptions` / `_rfp_chunks` children exist. `demo-run-start` and `demo-reset` can then be exercised end-to-end for the first time.

## Self-Check: PASSED

- `src/components/SaveAsDemoFixtureButton.tsx` — FOUND
- `src/components/__tests__/SaveAsDemoFixture.test.tsx` — FOUND
- Commit `2d20d54` — FOUND
- Commit `b34eef3` — FOUND
- Commit `2c784d6` — FOUND
