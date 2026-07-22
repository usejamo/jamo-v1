---
phase: 16-token-free-demo-mode
reviewed: 2026-07-21T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - supabase/functions/demo-capture-fixture/index.ts
  - supabase/functions/demo-run-start/index.ts
  - supabase/functions/demo-reset/index.ts
  - supabase/functions/_shared/demoRunCleanup.ts
  - supabase/functions/_shared/demoFixtureValidation.ts
  - supabase/migrations/20260721000001_demo_fixture_tables.sql
  - supabase/migrations/20260721000002_clone_demo_fixture_chunks_rpc.sql
  - supabase/migrations/20260721000003_demo_org.sql
  - supabase/migrations/20260721000004_demo_sweep_cron.sql
  - src/hooks/useDemoRun.ts
  - src/components/demo/DemoRunSurface.tsx
  - src/components/demo/DemoResetControl.tsx
  - src/components/SaveAsDemoFixtureButton.tsx
  - src/lib/demoOrg.ts
  - src/lib/invokeError.ts
  - src/components/wizard/Step4Generate.tsx
  - scripts/seed-demo-org.ts
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-07-21
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

No CRITICAL findings. Specifically, on the three invariants that carry the phase:

1. **Zero model calls.** No provider SDK, embedding endpoint, or invocation of a
   generation/extraction edge function appears anywhere on the demo path.
   `demo-run-start` materializes everything from fixture rows and a pure
   `INSERT...SELECT` RPC. `useDemoRun` seeds `extractionStatus='complete'`, which
   correctly starves `Step2DocumentUpload`'s `allComplete && extractionStatus === 'idle'`
   trigger (`Step2DocumentUpload.tsx:58`) — verified against the actual condition, not
   just the comment. The one residual exposure is a *presenter-initiated* upload (WR-05).
2. **Blast radius.** `demo-reset` and `sweep_abandoned_demo_runs` both fail closed on
   every leg, both bound deletion to the demo org, and neither touches Storage. The
   canonical RFP object is unreachable from every teardown path reviewed.
3. **Org-scoped gating.** All three edge functions require *caller's own org is the demo
   org*, resolved at runtime — never a hardcoded UUID. The one divergence (WR-04) fails
   closed. The exception is the RLS layer, which is role-only (WR-03).

The findings below are concentrated in two places the tests and the drift detector do not
reach: `demo-run-start`'s inline `abort()` rollback (a **third**, unfenced teardown
implementation — WR-01/WR-02), and the RLS policies (WR-03).

## Warnings

### WR-01: `demo-run-start` `abort()` ignores every delete error, stranding an unreachable proposal

**File:** `supabase/functions/demo-run-start/index.ts:307-312`
**Issue:** The rollback path awaits three deletes and checks none of them:

```ts
const abort = async (status: number, message: string) => {
  if (documentId) await admin.from('proposal_documents').delete().eq('id', documentId)
  await admin.from('demo_runs').delete().eq('proposal_id', proposalId)
  await admin.from('proposals').delete().eq('id', proposalId)
  return jsonError(status, message, corsHeaders)
}
```

If the `proposals` delete fails (FK contention, transient error, RLS/PostgREST hiccup) the
caller still receives the 500 for the *original* failure and the rollback failure is
invisible. The stranded row is then permanently unreachable by every cleanup mechanism the
phase built: `demo-reset` requires a `demo_runs.id`, and `sweep_abandoned_demo_runs` starts
from `demo_runs dr join proposals p` (`20260721000004:114-115`). `abort()` is only ever
reached *before* the `demo_runs` insert succeeds, so no `demo_runs` row exists — the leaked
demo-org draft proposal (plus its sections, assumptions, cloned chunks and
`document_extracts`) survives indefinitely and silently. This is exactly the
"leak is invisible until the tables are inspected months later" failure `demoRunCleanup.ts`
was written to prevent, reintroduced in the one teardown copy that module does not own.
**Fix:** check each error and surface a distinct, loud failure so the orphan is at least
attributable:

```ts
const abort = async (status: number, message: string) => {
  const failures: string[] = []
  if (documentId) {
    const { error } = await admin.from('proposal_documents').delete().eq('id', documentId)
    if (error) failures.push(`proposal_documents: ${error.message}`)
  }
  const { error: runDelError } = await admin.from('demo_runs').delete().eq('proposal_id', proposalId)
  if (runDelError) failures.push(`demo_runs: ${runDelError.message}`)
  const { error: propError } = await admin.from('proposals').delete().eq('id', proposalId)
  if (propError) failures.push(`proposals: ${propError.message}`)
  if (failures.length > 0) {
    console.error(`demo-run-start rollback INCOMPLETE for proposal ${proposalId}: ${failures.join('; ')}`)
    return jsonError(500, `${message} (rollback incomplete, proposal ${proposalId} leaked)`, corsHeaders)
  }
  return jsonError(status, message, corsHeaders)
}
```

Consider additionally inserting the `demo_runs` row *immediately after* the proposal insert
rather than last, so a leaked proposal remains sweepable by construction.

### WR-02: `abort()` is a third teardown copy — outside the drift detector, and missing step 0

**File:** `supabase/functions/demo-run-start/index.ts:307-312`
**Issue:** The phase documents teardown as existing exactly twice
(`_shared/demoRunCleanup.ts` and the PL/pgSQL sweep), fenced by
`demoSweepParity.test.ts`. There is a third: `abort()` above. It open-codes the same
delete sequence and omits **step 0** — clearing `proposal_assumptions.source_document`,
which `demoRunCleanup.ts:120-132` and `20260721000004:151-153` both perform precisely
because that FK is `ON DELETE NO ACTION` and would refuse the `proposal_documents` delete.
The hazard is dormant today, but the parity test parses only two files, so the moment a
future feature populates `source_document`, the two fenced copies stay correct and this
third one silently starts failing its rollback (compounding WR-01). **Fix:** import and
call the shared routine so there is genuinely one implementation:

```ts
import { cleanupDemoRun } from '../_shared/demoRunCleanup.ts'
// ...
const abort = async (status: number, message: string) => {
  try {
    await cleanupDemoRun(admin, { id: '', proposal_id: proposalId, org_id: callerOrgId })
  } catch (e) {
    console.error(`demo-run-start rollback failed for proposal ${proposalId}:`, e)
    return jsonError(500, `${message} (rollback incomplete, proposal ${proposalId} leaked)`, corsHeaders)
  }
  return jsonError(status, message, corsHeaders)
}
```

(`cleanupDemoRun` already deletes `proposal_documents` by `proposal_id`, which supersedes
the `documentId` tracking; step 3's `demo_runs` delete by a blank id is a harmless no-op,
or extend `DemoRunRef.id` to `string | null` and skip it.) If the shared module cannot be
imported here, extend `demoSweepParity.test.ts` to parse this file as a third copy.

### WR-03: Demo-table RLS is role-only, not org-scoped — contradicting both the table comments and the phase's own rule

**File:** `supabase/migrations/20260721000001_demo_fixture_tables.sql:108-126`
**Issue:** Every policy on all five tables is
`using (private.get_user_role() = 'super_admin')` with no org predicate, while each table
comment claims "Demo-org-scoped, super_admin-only" (`:30`, `:51`, `:67`, `:82`, `:97`).
The tables are *not* org-scoped. This is the exact anti-pattern the phase identified and
fixed in three edge functions (`isDemoRunCaller`, `isDemoResetCaller`, `isCapturableSource`)
and two UI gates: "role alone is not sufficient — a second super_admin exists in a real
client org." That second account can `SELECT` every `demo_fixtures` row (including
`rfp_extract_text`, the verbatim extracted RFP text), every captured section's HTML, and
every `demo_runs` row. Today the exposed content is demo-org material, so impact is low —
but the invariant asserted by the comments is not enforced, and the policy would not
constrain a future third super_admin either. **Fix:** add the org predicate the comments
already promise, on the two tables that carry `org_id`:

```sql
alter policy "demo_fixtures_super_admin_select" on demo_fixtures
  using (private.get_user_role() = 'super_admin' and org_id = private.get_user_org_id());

alter policy "demo_runs_super_admin_select" on demo_runs
  using (private.get_user_role() = 'super_admin' and org_id = private.get_user_org_id());
```

The three child tables have no `org_id`; scope them via
`exists (select 1 from demo_fixtures f where f.id = fixture_id and f.org_id = private.get_user_org_id())`.
If role-only is a deliberate call, correct the five table comments instead — the current
mismatch will mislead the next reader into assuming enforcement that is not there.

### WR-04: `demo-capture-fixture` resolves the demo org differently from every other copy

**File:** `supabase/functions/demo-capture-fixture/index.ts:148-149`
**Issue:**

```ts
const callerOrgIsDemo =
  (callerOrg?.feature_flags as Record<string, unknown> | null)?.is_demo === true
```

Every other resolver in the phase accepts flag **or** slug: `demo-run-start`'s `orgIsDemo`
(`:115-122`), `demo-reset`'s `orgIsDemo` (`:44-51`), `src/lib/demoOrg.ts:37`, and the
sweep's `feature_flags->>'is_demo' = 'true' or o.slug = 'jamo-demo'`
(`20260721000004:97-98`). The `select` at `:143-147` even fetches `slug` and then never uses
it. The divergence fails *closed* (capture 403s), so it is not a security hole — but the
direction is asymmetric and confusing: an org identified only by the `jamo-demo` slug is
treated as the demo org by both destructive endpoints and by the UI, yet capture refuses
it, producing a "capture only permitted for demo-org proposals" 403 on the demo org itself.
It also silently narrows if `is_demo` is ever stored as the JSON string `"true"`, which the
other two functions explicitly tolerate. **Fix:** use the same predicate:

```ts
function orgIsDemo(org: { slug?: string | null; feature_flags?: unknown } | null | undefined): boolean {
  if (!org) return false
  const flags = (org.feature_flags ?? null) as Record<string, unknown> | null
  if (flags && (flags.is_demo === true || flags.is_demo === 'true')) return true
  return org.slug === 'jamo-demo'
}
const callerOrgIsDemo = orgIsDemo(callerOrg)
```

### WR-05: The demo surface renders the real, unlocked upload dropzone — an accidental drop fires `extract-document`

**File:** `src/components/demo/DemoRunSurface.tsx:161-163`
**Issue:** `Step2DocumentUpload` is rendered with no `demoMode` lock, and it mounts the
live `FileUpload` component (`Step2DocumentUpload.tsx:5`). The demo's RFP document row
already exists, so the step is purely informational in the demo — yet a presenter who drops
a file into it mid-call uploads to the demo org and triggers real parsing/embedding on the
one path the phase guarantees makes zero provider calls. `Step4Generate` received exactly
this treatment for exactly this class of reason (`demoMode` locks the template so the
presenter "can point at the selection but cannot change it", `Step4Generate.tsx:66-79`);
the upload step did not. The newly-parsed document also would not re-fire
`extract-assumptions` (status is already `complete`), so the fixture assumptions and the
visible document count would silently disagree. **Fix:** add the same `demoMode` prop to
`Step2DocumentUpload` and render `DocumentList` without `FileUpload` when set:

```tsx
{wizardState.step <= 1 && (
  <Step2DocumentUpload state={wizardState} dispatch={wizardDispatch} demoMode />
)}
```

## Info

### IN-01: `seed-demo-org.ts` replaces `feature_flags` where the migration merges it

**File:** `scripts/seed-demo-org.ts:105-108`
**Issue:** The upsert writes `feature_flags: { is_demo: true }` wholesale on conflict,
whereas `20260721000003_demo_org.sql:23` deliberately merges
(`organizations.feature_flags || '{"is_demo": true}'::jsonb`) specifically so re-application
"can never clobber flags set later by other phases (T-16-06)". The script's own comment at
`:104` claims the two "converge" — they do not, in the presence of any other flag. The
idempotency guard at `:79-101` masks this in the common case (it returns early once a demo
presenter exists), so it only bites when the org has other flags *and* no presenter yet.
**Fix:** either drop `feature_flags` from the script's upsert and rely on the migration, or
read-merge-write the existing flags before upserting.

### IN-02: `useDemoRun` hardcodes the standard template UUID and sends it

**File:** `src/hooks/useDemoRun.ts:36,138`
**Issue:** `STANDARD_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001'` is passed as
`body.template_id`. `demo-run-start` already resolves the `is_default` template itself when
`template_id` is omitted (`:201-211`), and `templates_single_default` guarantees that lookup
is unambiguous. Sending the constant adds a hardcoded id that must stay in sync with the
seed for no gain: if the default template is ever reseeded under a new id, the demo fails
with "demo runs require the standard template" even though the server would have resolved
it correctly. **Fix:** invoke with an empty body and let the server resolve the default;
keep the constant only for tests/fallback display.

### IN-03: Nothing enforces that at most one org carries `is_demo`

**File:** `supabase/migrations/20260721000003_demo_org.sql:20-24`
**Issue:** The sweep refuses to run unless the flag/slug resolves to exactly one org
(`20260721000004:100-104`) — correct, fail-closed. But `demo-run-start` and `demo-reset`
only check *the caller's own* org, so if a second org were ever flagged `is_demo`, a
super_admin in that org could hard-delete its draft proposals via `demo-reset` while the
sweep quietly stopped running entirely. The blast radius stays inside the flagged org, and
setting the flag requires DB write access, so this is a hardening note rather than a live
issue. **Fix:** add a partial unique index making the flag singleton, so the sweep's
"exactly one" precondition is a schema guarantee rather than a runtime hope:

```sql
create unique index organizations_single_demo_org
  on organizations ((feature_flags->>'is_demo'))
  where feature_flags->>'is_demo' = 'true';
```

---

_Reviewed: 2026-07-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
