---
phase: 16-token-free-demo-mode
plan: 03
subsystem: edge-functions
tags: [supabase, edge-function, deno, super-admin-gate, fixtures, versioning, confidentiality]

# Dependency graph
requires:
  - phase: 16-token-free-demo-mode
    plan: 01
    provides: demo_fixtures + demo_fixture_sections/assumptions/rfp_chunks tables, unique(template_id,version), partial one-active-per-template index
  - phase: 16-token-free-demo-mode
    plan: 02
    provides: the jamo-demo org (feature_flags.is_demo = true) and the presenter super_admin whose captures this function accepts
  - phase: 15-client-onboarding-provisioning
    provides: the canonical super_admin gate copied verbatim from admin-create-org/index.ts
  - phase: 14.3-edge-identity-hardening
    provides: getAuthedUserAndOrg — identity from the verified JWT, never the request body
provides:
  - demo-capture-fixture edge function, DEPLOYED and ACTIVE on fuuvdcvbliijffogjnwg (version 1, verify_jwt true)
  - Monotonic versioned fixture capture with archive-prior-then-promote semantics (Decision B)
  - Exported pure helpers (nextVersion, isCapturableSource, buildRfpFields, findBlankSections) reusable by 16-04's fixture validation
affects: [16-04, 16-05, 16-06, 16-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Demo org resolved at runtime by organizations.feature_flags->>'is_demo', never a hardcoded UUID (carried from 16-02)"
    - "Two-sided capture guard: caller org must be is_demo AND the source proposal's org_id must equal the caller's org — content outside the demo org is unreachable by construction"
    - "Write order for a one-active-per-template partial unique index: insert new row as 'archived' -> fill children -> archive prior active -> promote new; every failure path restores the previous end state"
    - "Section content HTML is copied byte-for-byte; it is never parsed, decoded, or round-tripped through an editor document model, so data-placeholder-id spans survive capture"

key-files:
  created:
    - supabase/functions/demo-capture-fixture/index.ts
    - supabase/functions/demo-capture-fixture/deno.json
    - supabase/functions/demo-capture-fixture/test.ts
  modified: []

key-decisions:
  - "Capture requires BOTH that the caller's org carries feature_flags.is_demo AND that the source proposal's org_id equals that org. The plan only required the org match; the is_demo check makes a stolen/misconfigured super_admin session in a real client org unable to capture anything at all (T-16-09 defense in depth)."
  - "The new fixture is inserted with status 'archived' and promoted last, rather than archiving the prior active first as the plan's step order described. Same end state, but a failure during child inserts leaves the prior active fixture untouched instead of leaving the template with zero active fixtures."
  - "Capture refuses (400) a source proposal that has any blank/whitespace-only section, naming the offenders — a fixture with a blank section would render an empty section mid-demo, the exact failure SPEC Req 7 exists to prevent, and Req 7's validation lives in run-start where it would be far too late."
  - "Version allocation is a read-max-then-insert with a bounded 23505 retry (6 attempts), mirroring admin-create-org's slug loop. The DB unique(template_id, version) is the source of truth for concurrent captures, not a pre-check."
  - "captured_by is populated with user_profiles.id (the profile PK the FK points at), not the auth user id — the two differ and the plan's snippet only selected role."

patterns-established:
  - "Deno-unavailable contingency extended: the pure exported helpers were transpiled out of the real index.ts and executed under Node (11/11 assertions green), so the predicate tests are demonstrably passing rather than merely written."

requirements-completed: [SPEC-R1, SPEC-R2, SPEC-R5]

# Metrics
duration: ~35min (code tasks) + orchestrator-performed live review/fix/deploy
completed: 2026-07-21
---

# Phase 16 Plan 03: demo-capture-fixture Summary

**A super_admin-only, service-role edge function that snapshots a live demo-org proposal into a new monotonically versioned `demo_fixtures` record — sections (HTML verbatim, `data-placeholder-id` spans intact), assumptions, RFP study fields, extracted RFP text and pre-computed RFP chunk embeddings — refusing any source proposal outside the `is_demo` org and never overwriting a prior version; deployed and ACTIVE on `fuuvdcvbliijffogjnwg`.**

## Performance

- **Duration:** ~35 min (code tasks, this executor) + orchestrator-performed pre-deploy schema review, defect fix, and deploy
- **Started:** 2026-07-21
- **Completed:** 2026-07-21
- **Tasks:** 3/3 (Tasks 1-2 by this executor; Task 3 [BLOCKING, checkpoint:human-action] performed by the orchestrator)
- **Files created:** 3 (index.ts, deno.json, test.ts)

## Accomplishments

- `supabase/functions/demo-capture-fixture/index.ts` — `POST { source_proposal_id, label? }`, CORS preflight, and the verbatim `admin-create-org` gate: `getAuthedUserAndOrg` resolves the JWT-verified `userId`, then a service-role `user_profiles` read by that id yields `id, role, org_id`; anything other than `super_admin` returns `403 { error: 'super_admin required' }`. No identity, org, or role is ever read from the body (T-16-08/T-16-10).
- **Demo-org confinement (T-16-09 / D-05):** the caller's org row is read and `feature_flags->>'is_demo'` checked; the source proposal is then loaded and `proposal.org_id` must equal the caller's org. Either failure returns `403 { error: 'capture only permitted for demo-org proposals' }`. A missing proposal returns the same 403 rather than a 404, so the endpoint cannot be used to probe for proposal ids in other orgs.
- **Versioning (Decision B / T-16-11):** `nextVersion()` implements `coalesce(max(version),0)+1` scoped to the source's `selected_template_id`; a bounded 6-attempt `23505` retry lets concurrent captures resolve against the DB's `unique(template_id, version)`. Recapture always mints a new version; prior versions are retained as `archived` and remain reactivatable by a status flip.
- **Snapshot contents:** `rfp_fields` jsonb built from the 10 study columns incl. the JSON-stuffed `description` blob (carried as an opaque string); `rfp_extract_text` from `document_extracts.content` reached through `proposal_documents`, preferring `doc_type='rfp'`; `demo_fixture_sections` (role/position/section_name/content/compliance_flags); `demo_fixture_assumptions` (all statuses, not only approved); `demo_fixture_rfp_chunks` from `chunks` where `doc_type='proposal'`, with `embedding` written back in its pgvector text form unchanged so dimensionality and `metadata` shape are preserved (Decision C). All child inserts are batched at 100 rows.
- **Failure containment:** any child-insert or status-flip failure deletes the half-built fixture (children cascade) so no partial version is ever left behind.
- `supabase/functions/demo-capture-fixture/test.ts` — 13 pure `Deno.test` predicates against helpers exported from `index.ts` plus 5 `ignore: true` live-only integration stubs (403 non-super_admin regardless of body, 403 non-demo-org source, recapture-yields-new-version + exactly-one-active, byte-for-byte placeholder-span preservation, 1536-dim embedding parity).

## Task Commits

Each task was committed atomically:

1. **Task 1: demo-capture-fixture edge fn (gate + versioned snapshot)** - `7d78030` (feat)
2. **Task 2: Grep/predicate acceptance test** - `77c6f2a` (test)
3. **Task 3: [BLOCKING] Deploy demo-capture-fixture** - performed by the orchestrator at the human-action checkpoint; produced one code commit, `4d677da` (fix — see Deviations), plus the live deploy

**Plan metadata:** (this commit)

## Files Created/Modified

- `supabase/functions/demo-capture-fixture/index.ts` - super_admin-gated, demo-org-confined, versioned fixture capture
- `supabase/functions/demo-capture-fixture/deno.json` - import map (`supabase` -> `npm:@supabase/supabase-js@2`), copied from admin-create-org
- `supabase/functions/demo-capture-fixture/test.ts` - 13 pure predicates + 5 live-only integration stubs

## Decisions Made

- **`captured_by` is `user_profiles.id`, not the auth user id.** `demo_fixtures.captured_by` FKs `user_profiles(id)` (16-01 migration), while `getAuthedUserAndOrg` returns `auth.users.id`. The plan's copy-verbatim gate snippet selects only `role`; the gate here selects `id, role, org_id` so the correct PK is stored and the demo org is known in the same round trip.
- **Missing proposal returns 403, not 404.** Distinguishing "no such proposal" from "wrong org" would turn the endpoint into an id oracle across orgs. Both collapse to the same 403.
- **Assumptions are captured at all statuses.** The plan says capture all; generation consumes only `approved`, so preserving the full set lets a later fixture-driven run reproduce the assumptions *screen* faithfully rather than only the generation input.
- **Repo `test.ts`-imports-`index.ts` convention followed** (as in `extract-assumptions`, `retrieve-context`, `generate-proposal-section`) rather than splitting helpers into a sibling module, keeping the plan's "export a pure helper from index.ts" instruction literal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Caller org must carry `feature_flags.is_demo`, not just match the source**
- **Found during:** Task 1
- **Issue:** The plan required only `proposals.org_id === callerOrgId`. That alone is satisfied by *any* super_admin capturing a proposal from their own org — including a real client org — which would bake live client content into a shipped fixture, the precise D-05/T-16-09 failure.
- **Fix:** `isCapturableSource(sourceOrgId, callerOrgId, callerOrgIsDemo)` requires the org match AND `feature_flags->>'is_demo' = true` on the caller's org, resolved by flag at runtime (never a hardcoded UUID). Fails closed on any null.
- **Files modified:** `supabase/functions/demo-capture-fixture/index.ts`
- **Commit:** `7d78030`

**2. [Rule 2 - Missing critical functionality] Capture refuses a proposal with blank sections**
- **Found during:** Task 1
- **Issue:** `demo_fixture_sections.content` is `NOT NULL` but an empty string satisfies it. A source proposal whose generation had not finished would capture cleanly and then render a blank section mid-demo — SPEC Req 7's "never render a blank section", detected far too late (at run-start).
- **Fix:** `findBlankSections()` returns the names of any empty/whitespace-only sections; capture returns `400 source proposal has ungenerated section(s): <names>` before writing anything. Also 400s when the proposal has no sections at all.
- **Files modified:** `supabase/functions/demo-capture-fixture/index.ts`
- **Commit:** `7d78030`

**3. [Rule 2 - Missing critical functionality] Write order reordered to preserve the never-zero-active invariant**
- **Found during:** Task 1
- **Issue:** The plan's step order (archive the prior active, then insert the new active, then fill children) leaves the template with zero active fixtures for the whole duration of the child inserts, and permanently if any child insert fails.
- **Fix:** insert the new fixture as `'archived'` -> insert all children -> archive the prior active -> promote the new one as the final write. Identical end state, and the partial unique index is satisfied at every instant. Any failure after the parent insert deletes the half-built fixture (children cascade).
- **Files modified:** `supabase/functions/demo-capture-fixture/index.ts`
- **Commit:** `7d78030`

**4. [Rule 2 - Missing critical functionality] Bounded 23505 retry on version allocation**
- **Found during:** Task 1
- **Issue:** Read-max-then-insert races between two concurrent captures on the same template; the plan specified no collision handling.
- **Fix:** 6-attempt loop that recomputes `nextVersion` and retries on Postgres `23505`, mirroring `admin-create-org`'s slug loop; exhaustion returns 409. The DB constraint stays the source of truth (no pre-check).
- **Files modified:** `supabase/functions/demo-capture-fixture/index.ts`
- **Commit:** `7d78030`

**5. [Rule 1 - Bug, found and fixed by the orchestrator at the deploy checkpoint] Promote-failure path could still leave zero active fixtures**
- **Found during:** Task 3 pre-deploy review
- **Issue:** Deviation 3's reordering fixed the child-insert window but not the last leg. In the archive-succeeds / promote-fails interleaving, `abort()` deleted the newly captured fixture while the prior one had **already** been flipped to `archived` — leaving the template with zero active fixtures and nothing for `demo-run-start` to resolve. That is exactly the state the reordering was written to prevent, so the invariant was incompletely enforced, not merely un-optimised.
- **Fix:** the prior active row's id is now read **before** the archive; if the promote fails, that row is restored to `'active'` before the new row is deleted. The new row is still `'archived'` at that point, so the partial unique index permits restore-then-delete in that order.
- **Files modified:** `supabase/functions/demo-capture-fixture/index.ts`
- **Commit:** `4d677da` (authored by the orchestrator)

## Issues Encountered

- **Deno is not installed in this sandbox** (confirmed: `command -v deno` empty) — the repo-wide 14.3-05 contingency. Rather than leaving the predicate tests unexecuted, the exported helper block was transpiled out of the real `index.ts` via the project's own `typescript` package and executed under Node: **11/11 assertions passed** against the shipped source. The 5 `ignore: true` cases remain genuinely unexecuted by design (they need a live DB).
- One near-miss on the plan's *negative* acceptance grep (`serialize|tiptap|JSON.parse(section` must not appear): an explanatory comment initially described the HTML as not being "re-serialized". Reworded to "never parsed, re-encoded, or round-tripped through any editor document model" — same meaning, grep clean. Same class of adjustment as 16-01/16-02.

## Verification

**Passed (this executor):**
- All 6 positive Task 1 acceptance greps on `index.ts`; the negative grep returns nothing.
- Task 2: `grep -q "ignore: true"` passes; `grep -c "Deno.test"` = 18 (>= 2 required).
- 11/11 pure-helper assertions green under Node against the real `index.ts` source.

**Passed (orchestrator, live, project `fuuvdcvbliijffogjnwg`):**
- Pre-deploy schema review via Supabase MCP: all 27 column references the function uses exist on the live schema — `proposal_sections(role,position,name,content,compliance_flags)`, `proposal_assumptions(category,content,confidence,status,user_edited)`, `proposal_documents.doc_type`, `document_extracts(document_id,content)`, `proposals(selected_template_id + all 10 RFP_FIELD_COLUMNS)`, `user_profiles.user_id`, `chunks(doc_type,proposal_id)`. Zero missing. `_shared/auth.ts` exports confirmed; deno.json import map confirmed.
- `npx supabase functions deploy demo-capture-fixture --project-ref fuuvdcvbliijffogjnwg` (token from `.env`) -> "Deployed Functions." `_shared/auth.ts` bundled alongside `index.ts` + `deno.json`.
- MCP `list_edge_functions`: slug `demo-capture-fixture`, version 1, status **ACTIVE**, `verify_jwt: true`, `import_map: true` — `verify_jwt: true` matches the `admin-*` functions, correct for a super_admin endpoint.

**DEFERRED — not exercised, do not read as passed:**
- **No end-to-end capture has been run.** No proposal exists in the demo org yet to capture, so the functional path (fixture row + child row counts vs source counts, byte-for-byte section equality, 1536-dim embedding parity, recapture-yields-version-2) is **unverified**. This belongs to a later plan once a real generated proposal exists in the demo org. The 5 `ignore: true` stubs in `test.ts` enumerate exactly what must be checked then.
- The live 403 smoke tests (non-super_admin caller; non-demo-org source) are likewise unrun.

## Next Phase Readiness

- **16-04 (`demo-run-start`)** consumes what this writes. It resolves the **active** fixture for the standard template, so it must tolerate the archived-then-promoted write order (a fixture is only `active` once complete — an in-flight capture is never selectable, which is the desired behaviour). It should reuse `clone_demo_fixture_chunks(p_fixture_id, p_proposal_id, p_org_id)` from 16-01 for the chunk replay rather than re-implementing the copy. Its Req 7 fixture validation can reuse this function's `findBlankSections` shape but must additionally compare fixture section roles/positions against current `template_sections`.
- **16-05 (`demo-reset`)** should copy this function's gate verbatim (`getAuthedUserAndOrg` -> `user_profiles` role/org/id read -> 403), and note the same `captured_by`-style trap: `demo_runs.started_by` also FKs `user_profiles(id)`, not `auth.users(id)`.
- **Both 16-04 and 16-05 need their own explicit `supabase functions deploy` checkpoint** — this repo's execute-phase never deploys automatically (memory `edge-functions-need-deploy`). `verify_jwt: true` is the right setting for all of them.
- The demo-org confinement predicate (`isCapturableSource`) is the pattern the reset/sweep guards should mirror: resolve the demo org by `feature_flags->>'is_demo'` at runtime, never hardcode the UUID, and fail closed on nulls.
- **Carry-forward gap:** nothing in the demo org has been captured yet, so `demo_fixtures` is empty. 16-04's live verification will be blocked until a demo-org proposal is generated and captured — sequence that before attempting a run-start smoke test.
- No blockers carried forward.

## Self-Check: PASSED

- FOUND: supabase/functions/demo-capture-fixture/index.ts
- FOUND: supabase/functions/demo-capture-fixture/deno.json
- FOUND: supabase/functions/demo-capture-fixture/test.ts
- FOUND: .planning/phases/16-token-free-demo-mode/16-03-SUMMARY.md
- FOUND commit: 7d78030
- FOUND commit: 77c6f2a
- FOUND commit: 4d677da
- Tests: 11/11 pure-helper assertions green under Node (Deno unavailable); 5 integration cases deliberately `ignore: true`

---
*Phase: 16-token-free-demo-mode*
*Completed: 2026-07-21*
