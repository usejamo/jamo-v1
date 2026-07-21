---
phase: 16-token-free-demo-mode
plan: 04
subsystem: edge-functions
tags: [supabase, edge-function, deno, super-admin-gate, fixtures, zero-token, validation, rag]

# Dependency graph
requires:
  - phase: 16-token-free-demo-mode
    plan: 01
    provides: demo_fixtures/sections/assumptions/rfp_chunks/demo_runs tables + clone_demo_fixture_chunks(p_fixture_id,p_proposal_id,p_org_id) service_role RPC
  - phase: 16-token-free-demo-mode
    plan: 02
    provides: the jamo-demo org (feature_flags.is_demo = true) and the presenter super_admin this endpoint requires
  - phase: 16-token-free-demo-mode
    plan: 03
    provides: demo-capture-fixture — the writer of the active fixture this function replays; RFP_FIELD_COLUMNS parity
  - phase: 14.3-edge-identity-hardening
    provides: getAuthedUserAndOrg — identity from the verified JWT, never the request body
provides:
  - demo-run-start edge function, DEPLOYED on fuuvdcvbliijffogjnwg (verify_jwt true)
  - validateFixtureAgainstTemplate — pure fixture-vs-template diff, in BOTH src/lib and supabase/functions/_shared, kept identical by a test
  - Exported predicates (isDemoRunCaller, orgIsDemo, isStandardTemplate, pickRfpFields, buildDemoTitle, demoRfpStoragePath) reusable by 16-05/16-06
  - DEMO_RFP_STORAGE_PATH — the shared canonical RFP object path convention reset/sweep must NOT delete
affects: [16-05, 16-06, 16-07, 16-08, 16-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duplicated src/ <-> _shared modules are kept honest by a byte-identity test over a '// ==== SHARED LOGIC ====' marker, so drift fails npm run test:run instead of failing silently in production"
    - "Fixture pre-population validates against the CURRENT template before the first write; a mismatch is a 422 naming the section, never a blank section rendered mid-demo"
    - "Zero-model-call invariant is grep-enforced: the source may not even mention a provider name, so the guard comment is worded to keep the negative grep clean"
    - "Fixture jsonb is whitelisted into an insert (pickRfpFields), never spread — identity columns cannot ride in on captured data"

key-files:
  created:
    - src/lib/demoFixtureValidation.ts
    - src/lib/__tests__/demoFixtureValidation.test.ts
    - supabase/functions/_shared/demoFixtureValidation.ts
    - supabase/functions/demo-run-start/index.ts
    - supabase/functions/demo-run-start/deno.json
    - supabase/functions/demo-run-start/test.ts
  modified: []

key-decisions:
  - "The guard is org-scoped, not merely role-scoped: the caller must be a super_admin whose OWN org carries feature_flags.is_demo (or slug jamo-demo). Two super_admins now exist; a role-only gate would let the Phase-15 internal super_admin materialize demo content into a real client org."
  - "proposals.title is NOT NULL but is not part of the captured rfp_fields, so buildDemoTitle derives it in ProposalCreationWizard's format with a 'Demo Proposal' fallback — a fixture can never produce a null-title insert failure mid-demo."
  - "template_id is optional in the body. When omitted the default template is resolved server-side; when supplied it must be is_default. Either path is constrained to the standard template, so the optionality adds no attack surface and removes a client-side coupling."
  - "The shared canonical RFP Storage path is composed at runtime as {callerOrgId}/demo/canonical-demo-rfp.pdf. The documents bucket's RLS keys on the first path segment being the caller's org (20260305000014_storage_policies.sql), so an org-less constant path would be unreadable by the presenter — and the demo org UUID still is never hardcoded."
  - "Failure past the proposals insert tears the whole run down (explicitly deleting proposal_documents, whose FK is SET NULL rather than cascade) so a demo is never left half-populated. The shared canonical Storage object is referenced, not owned, and is never touched."

patterns-established:
  - "Anti-drift test for the Deno-cannot-import-src duplication: previously the two copies (slug.ts, chunker.ts) were kept in sync by a comment alone. This plan makes the parity machine-checked."

requirements-completed: [SPEC-R1, SPEC-R3, SPEC-R4, SPEC-R5, SPEC-R7]

# Metrics
duration: ~45min (code tasks) + orchestrator-performed live review/fix/deploy
completed: 2026-07-21
---

# Phase 16 Plan 04: demo-run-start Summary

**The heart of the phase: a super_admin-and-demo-org-gated edge function that validates the active fixture against the current standard template before writing anything, then materializes one fresh isolated draft proposal — pre-populated sections, approved assumptions, an RFP document row pointing at the shared canonical Storage object, and RFP chunks cloned with their real pre-computed embeddings — making ZERO model, LLM or embedding provider calls; deployed on `fuuvdcvbliijffogjnwg`.**

## Performance

- **Duration:** ~45 min (code tasks, this executor) + orchestrator-performed live schema review, defect fix, and deploy
- **Started:** 2026-07-21
- **Completed:** 2026-07-21
- **Tasks:** 3/3 by this executor; the deploy checkpoint performed by the orchestrator
- **Files created:** 6

## Accomplishments

- **`src/lib/demoFixtureValidation.ts` + `supabase/functions/_shared/demoFixtureValidation.ts`** — `validateFixtureAgainstTemplate(templateSections, fixtureSections)` diffs by `(role, position)` and returns `{ok:true}` or `{ok:false, error}`. Failure modes, each with a named section in the message: a template role missing from the fixture, an extra fixture role the template no longer defines, and position drift (reported as `template position N, fixture position M`). It fails **closed** on everything ambiguous — an empty template, an empty fixture, a null/blank role on either side, a non-integer position, or a duplicated role. Row order is irrelevant; the diff is by key, not index.
- **Machine-checked copy parity.** The Deno copy is generated from the src copy's `// ==== SHARED LOGIC ====` marker, and a Vitest case asserts the two blocks are byte-identical (CRLF-normalized). The historical `slug.ts`/`chunker.ts` convention relied on a "keep in sync" comment; here a drift **fails `npm run test:run`**.
- **`supabase/functions/demo-run-start/index.ts`** — `POST { template_id? }`. CORS preflight, then the verbatim `admin-create-org` gate off the JWT-verified `userId`, selecting `id, role, org_id` from `user_profiles` so the **profile PK** is available (`demo_runs.started_by`, `proposal_documents.uploaded_by` and `proposals.created_by` all FK `user_profiles(id)`, not `auth.users(id)`). Non-`super_admin` → `403 super_admin required`; a super_admin whose own org is not the demo org → `403 demo runs are only permitted from the demo org`.
- **Standard-template-only (Req 4):** a supplied `template_id` must have `templates.is_default = true`; omitted, the default template is resolved server-side. Otherwise `400 demo runs require the standard template`.
- **Validate before write (Req 7):** the active fixture (`status='active'`, one per template by 16-01's partial unique index) is loaded, its sections and the current `template_sections` diffed, and a mismatch returns `422` with the offending section named — **before the first insert**. `400 no active demo fixture for the standard template` when none exists.
- **Atomic materialization (Req 5):** a fresh `proposals` row (`status='draft'`, `org_id`/`created_by` bound server-side from the verified caller, RFP study fields whitelisted out of the fixture jsonb by `pickRfpFields`, `title` derived by `buildDemoTitle`) anchors everything that follows — `proposal_sections` (one per template section, `section_key='section-{position}'`, `content` from the fixture, `status='complete'`, `generated_at` set), `proposal_assumptions` (status `approved`), a `proposal_documents` row at the shared canonical path with `parse_status='complete'` (Step2DocumentUpload polls this and only advances when every row is complete) plus its `document_extracts` row carrying `rfp_extract_text`, and a `demo_runs` tracking row. Response: `{ proposal_id, demo_run_id, fixture_id, fixture_version, template_id, document_id, sections, assumptions, rfp_chunks }`.
- **Zero model calls (Req 3 / T-16-15):** RFP chunks arrive via `admin.rpc('clone_demo_fixture_chunks', ...)` — a pure `INSERT ... SELECT` of vectors that already exist. The function contains no provider SDK, no embedding endpoint, and no invocation of any generation/extraction edge function. The invariant is asserted statically against the shipped source in `test.ts`, which is why the guard comment deliberately does not spell the provider names out.
- **Failure containment:** any failure after the proposals insert deletes the `proposal_documents` row (its FK to proposals is SET NULL, not cascade), the `demo_runs` row, and the proposal itself (cascading sections, assumptions, cloned chunks, chats). The shared canonical Storage object is never touched.
- **`supabase/functions/demo-run-start/test.ts`** — 17 pure `Deno.test` predicates plus 2 static-source invariants (no model call; validation precedes the first `proposals` write) and 9 `ignore: true` live-only integration stubs.

## Task Commits

1. **Task 1: Pure fixture-vs-template validation module (Req 7)** — `e163b82` (feat, TDD: test written and confirmed failing first)
2. **Task 2: demo-run-start edge fn** — `14406b9` (feat)
3. **Task 3: predicate + integration-stub tests** — `d89ad59` (test)
4. **Deploy checkpoint (orchestrator):** one code commit `07b08cb` (fix — see Deviations) plus the live deploy

## Files Created/Modified

- `src/lib/demoFixtureValidation.ts` - pure fixture-vs-template diff, Vitest-testable
- `src/lib/__tests__/demoFixtureValidation.test.ts` - 14 cases incl. the src/_shared byte-identity guard
- `supabase/functions/_shared/demoFixtureValidation.ts` - Deno copy, generated from the src shared block
- `supabase/functions/demo-run-start/index.ts` - gated, validating, atomic demo-run materializer
- `supabase/functions/demo-run-start/deno.json` - import map (`supabase` -> `npm:@supabase/supabase-js@2`)
- `supabase/functions/demo-run-start/test.ts` - 19 executable predicates + 9 live-only stubs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `proposals.title` is NOT NULL and is not in the fixture**
- **Found during:** Task 2
- **Issue:** `demo_fixtures.rfp_fields` captures the 10 study columns; `title` is not among them, but the column is NOT NULL. Every run would have failed at the first insert.
- **Fix:** `buildDemoTitle()` derives `"{client} — {indication} ({phase})"` (ProposalCreationWizard's format) from the fixture fields, falling back to `'Demo Proposal'` when they are blank. Unit-tested for the blank case specifically.
- **Files modified:** `supabase/functions/demo-run-start/index.ts`
- **Commit:** `14406b9`

**2. [Rule 2 - Missing critical functionality] The guard must be org-scoped, not role-scoped**
- **Found during:** Task 2
- **Issue:** The plan specified only the super_admin gate. Two super_admins now exist — the demo presenter and the Phase-15 internal account. A role-only gate would let the internal one materialize demo content (a draft proposal, cloned chunks, a document row) directly into a **real client org**, since `org_id` is bound from the caller.
- **Fix:** `orgIsDemo()` resolves the demo org at runtime by `feature_flags.is_demo` (or the `jamo-demo` slug — never a hardcoded UUID) and `isDemoRunCaller()` requires it, failing closed on nulls. Mirrors `isCapturableSource` from 16-03. Non-demo-org callers get `403 demo runs are only permitted from the demo org`.
- **Files modified:** `supabase/functions/demo-run-start/index.ts`
- **Commit:** `14406b9`

**3. [Rule 2 - Missing critical functionality] Fixture jsonb whitelisted rather than spread**
- **Found during:** Task 2
- **Issue:** `rfp_fields` is `jsonb`. Spreading it into the `proposals` insert would let a malformed or tampered fixture supply `org_id`, `created_by` or `status`, defeating the server-side identity binding the access-control rule exists to guarantee (T-16-13).
- **Fix:** `pickRfpFields()` copies only the 10 known RFP columns (the same set `demo-capture-fixture` writes) and drops everything else. Unit-tested with `org_id`/`created_by`/`status` present in the input.
- **Files modified:** `supabase/functions/demo-run-start/index.ts`
- **Commit:** `14406b9`

**4. [Rule 2 - Missing critical functionality] Full teardown on partial failure**
- **Found during:** Task 2
- **Issue:** The plan describes the write sequence as "atomic", but these are separate PostgREST round trips with no shared transaction. A failure midway would leave a half-populated proposal that a presenter could still open — the exact mid-demo failure this phase exists to avoid.
- **Fix:** an `abort()` path deletes the `proposal_documents` row **explicitly** (its FK to proposals is SET NULL, not cascade — SPEC's orphan caveat), the `demo_runs` row, then the proposal (cascading sections, assumptions, cloned chunks). The shared canonical Storage object is referenced, not owned, and is never deleted (D-06).
- **Files modified:** `supabase/functions/demo-run-start/index.ts`
- **Commit:** `14406b9`

**5. [Rule 3 - Blocking] Column shape mismatches between fixture and target tables**
- **Found during:** Task 2
- **Issue:** `demo_fixture_assumptions.category` is nullable but `proposal_assumptions.category` is NOT NULL; `proposal_sections` requires both `section_key` and `section_name`; the canonical RFP Storage path could not be a bare constant because the `documents` bucket's RLS keys on the first path segment being the caller's org id.
- **Fix:** `category` coalesces to `'general'` (confidence to `'high'`); the section insert mirrors ProposalCreationWizard's shape exactly with `status='complete'`/`generated_at`; `demoRfpStoragePath(orgId)` composes `{orgId}/demo/canonical-demo-rfp.pdf` — one shared path per org, identical for every run, with the demo UUID still resolved at runtime.
- **Files modified:** `supabase/functions/demo-run-start/index.ts`
- **Commit:** `14406b9`

**6. [Rule 1 - Bug, found and fixed by the orchestrator at the deploy checkpoint] Role-normalization mismatch between validation and materialization**
- **Found during:** the deploy checkpoint's pre-deploy review
- **Issue:** `validateFixtureAgainstTemplate` compares roles **after trimming** (`normRole`), but the materialization loop keyed its fixture map on the raw `String(s.role)` and looked up with the raw `String(ts.role)`. A template role and its fixture counterpart differing only by surrounding whitespace would therefore **pass validation and then miss on lookup**, where the `content: fs?.content ?? ''` fallback silently pre-populated a **blank section** — precisely the Req 7 mid-demo failure the validation exists to prevent. The two halves of the same guarantee disagreed about what "the same role" means.
- **Fix:** the map is keyed and queried with the same trim normalization, and an explicit pre-write `unmatched` check now returns `422` naming the offending sections rather than ever falling back to empty content.
- **Files modified:** `supabase/functions/demo-run-start/index.ts`
- **Commit:** `07b08cb` (authored by the orchestrator)

## Issues Encountered

- **Deno is not installed in this sandbox** (repo-wide 14.3-05 contingency). Rather than shipping unexecuted predicates, the pure exported block was transpiled out of the real `index.ts` and the real `_shared/demoFixtureValidation.ts` via the project's own `typescript` package and executed under Node: **16/16 assertions passed** against the shipped source. The 9 `ignore: true` cases remain genuinely unexecuted by design (they need a live DB and a populated fixture).
- One near-miss on the phase's own zero-model-call grep: the header comment initially spelled out the forbidden provider/function names while forbidding them, which trips any CI grep asserting their absence. Reworded to describe the invariant without naming them. Same class of adjustment as 16-01/16-02/16-03.

## Verification

**Passed (this executor):**
- `npm run test:run -- demoFixtureValidation` → **14/14 passed** (match, order-independence, named missing section, multiple missing, position drift, extra role, empty fixture, empty template, null template role, null fixture role, duplicate role, non-integer position, src/_shared byte identity, Deno export present).
- All 8 positive Task 2 acceptance greps on `index.ts`; the negative model-call grep returns nothing.
- Task 3: `grep -q "ignore: true"` passes; `grep -c "Deno.test"` = 26 (>= 2 required).
- **16/16** pure assertions green under Node against the real source, including the two static invariants (no provider reference; `validateFixtureAgainstTemplate(` appears before the first `.from('proposals')`).

**Passed (orchestrator, live, project `fuuvdcvbliijffogjnwg`):**
- Pre-deploy review against the **live** schema via Supabase MCP: all **37** column references exist; zero missing. FK targets confirmed — `proposals.created_by`, `proposal_documents.uploaded_by` and `demo_runs.started_by` all reference `user_profiles`, so the profile-PK usage is correct and the repeat trap was avoided. No CHECK constraints on `proposals.status` / `proposal_sections.status` / `proposal_assumptions.confidence|status` / `proposal_documents.parse_status`, so the literals `'draft'`, `'complete'`, `'high'`, `'approved'` are accepted.
- Independent zero-model-call scan (`openai|anthropic|claude|embedding|completions|functions.invoke|/functions/v1/|fetch(`): every hit is a comment, no code. **The phase's central invariant holds.**
- `npx supabase functions deploy demo-run-start --project-ref fuuvdcvbliijffogjnwg` → "Deployed Functions." Bundled `index.ts`, `deno.json`, `_shared/auth.ts`, `_shared/demoFixtureValidation.ts`.

**NOT EXERCISED — deferred, do not read as passed:**
- **No end-to-end run has been performed.** `demo_fixtures` is empty (nothing has been captured yet — 16-03's own carry-forward gap), so the only reachable response today is `400 no active demo fixture for the standard template`. That is the **correct pre-capture behaviour, not a passed test.**
- The **422 drift path** is unproven live — only its pure logic is tested.
- **Concurrency/isolation** (two runs → distinct `proposal_id`s and `demo_run_id`s that never collide) is unproven live; it is structural, not defended by a lock.
- The **clone count** and embedding parity of the cloned `chunks` rows are unproven live, as is retrieval returning real RFP citations with no run-time embed.
- The live `403` smokes (non-super_admin; super_admin outside the demo org) are unrun.
- These are enumerated as the 9 `ignore: true` stubs in `supabase/functions/demo-run-start/test.ts`.

## PREREQUISITE — canonical RFP Storage object does not exist yet

`demo-run-start` writes a `proposal_documents` row pointing at **`{demoOrgId}/demo/canonical-demo-rfp.pdf`** in the `documents` bucket. **That object has not been uploaded.** Until it is, a demo run will create entirely correct DB rows and the wizard will advance (Step2 polls `parse_status`, which is `'complete'`), but **downloading/previewing the RFP will 404** — an easy thing to discover mid-demo. Upload the canonical demo RFP to that exact path before the first live run. Reset and sweep must **never** delete it: it is referenced by every run, owned by none (D-06).

## Next Phase Readiness

- **16-05 (`demo-reset`)** should copy this function's gate verbatim, including the **org-scoped** demo check (`orgIsDemo` / `isDemoRunCaller`) — role alone is insufficient. Reset is `demo_run_id`-scoped: resolve the run, assert its proposal is in the demo org and `status='draft'`, then delete `proposal_documents` **explicitly** (SET NULL, not cascade) before the proposal, and delete the `demo_runs` row. The teardown in this function's `abort()` is the exact shape to extract into the shared cleanup module. `demo_runs.started_by` is the **profile PK**.
- **16-06 (sweep)** reuses that same cleanup over `demo_runs` older than the threshold, and must likewise retain the shared canonical Storage object.
- **16-08 (presenter run surface)** calls this endpoint and gets `{ proposal_id, demo_run_id }`; it must persist `demo_run_id` in the session for 16-09's run-scoped reset control. Sections arrive already `status='complete'`, so per-section pacing is purely a frontend reveal concern — the server has already written everything.
- **Sequencing blocker for live verification:** a real proposal must be generated in the demo org and captured via `demo-capture-fixture` before `demo-run-start` can be smoke-tested at all. That single step unblocks the deferred verifications of both 16-03 and 16-04.
- No blockers carried forward.

## Self-Check: PASSED

- FOUND: src/lib/demoFixtureValidation.ts
- FOUND: src/lib/__tests__/demoFixtureValidation.test.ts
- FOUND: supabase/functions/_shared/demoFixtureValidation.ts
- FOUND: supabase/functions/demo-run-start/index.ts
- FOUND: supabase/functions/demo-run-start/deno.json
- FOUND: supabase/functions/demo-run-start/test.ts
- FOUND: .planning/phases/16-token-free-demo-mode/16-04-SUMMARY.md
- FOUND commit: e163b82
- FOUND commit: 14406b9
- FOUND commit: d89ad59
- FOUND commit: 07b08cb
- Tests: 14/14 Vitest green; 16/16 pure assertions green under Node (Deno unavailable); 9 integration cases deliberately `ignore: true`
- No stubs: every code path writes real data; no placeholder content, no hardcoded empty returns

---
*Phase: 16-token-free-demo-mode*
*Completed: 2026-07-21*
