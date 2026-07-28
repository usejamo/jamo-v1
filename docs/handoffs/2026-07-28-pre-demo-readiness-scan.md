# Pre-demo readiness scan — 2026-07-28

Scope: GSD planning artifacts (.planning/), backlog, todos, handoffs, deploy drift,
live prod state (`fuuvdcvbliijffogjnwg`), security advisors, test/code debt.

---

## P0 — ACTIVE DATA LEAK (fix before demo)

**`public._gap_debug` has RLS disabled and is exposed via PostgREST.**

Verified live, unauthenticated, using only `VITE_SUPABASE_PUBLISHABLE_KEY` (which ships
inside the deployed Netlify bundle, so it is effectively public):

```
UNAUTHENTICATED GET /_gap_debug -> 200, rows returned
control        GET /proposals   -> 200, rows=0   (RLS correctly hides them)
```

The table holds **181 rows** of `haiku_raw` — real client proposal content (section
titles, gap descriptions) from the Quorvane and Vericel proposals. Anyone with the
public key can read it. Supabase advisor flags it ERROR `rls_disabled_in_public`.

This is the TEMP DIAGNOSTIC table (marked "REVERT after" in
`analyze-proposal-gaps/index.ts`) that I recommended retaining last session to verify the
suggestions fix. That recommendation is what keeps the leak open.

**Fix (one statement, reversible, does not break the diagnostic** — the edge function
writes with the service role, which bypasses RLS):

```sql
alter table public._gap_debug enable row level security;
-- no policies = anon/authenticated get nothing; service_role still reads/writes
```

Then drop the table entirely once the suggestions fix is confirmed in prod.

---

## P1 — the two suggestion fixes are NOT live

Both fixes from this session are **uncommitted and undeployed**. In particular the
blank-suggestions bug (~1.7% of analysis runs — 3 of 181) is still live in prod and can
fire mid-demo: the queue empties and only repopulates on the next successful run.

Needs: commit → deploy `analyze-proposal-gaps` → push for Netlify.
Frontend (`scrollToEdit`) also ships via that push.

---

## P2 — real bugs, but only on specific demo paths

Both are **irrelevant to the `/demo` fixture-replay path** (which does zero generation
and zero extraction) and only bite a *live* generation/upload demo:

- **Backlog 999.5 — first-section placeholder marking bug.** On a NEW proposal
  generation the first section's placeholders mark incorrectly and a console error
  appears. Reproduces with no document uploaded. No plan written, no root cause.
- **Backlog 999.4 — extract-document stuck at `extracting`.** Live state is currently
  clean (0 stuck, 0 failed docs) and `reap_stuck_document_extractions()` now exists.
  The ROADMAP text still states the refuted size-driven premise.

**Recommendation:** keep the CEO on the `/demo` path. It is the only flow with live
end-to-end evidence (4 runs, all 9 sections populated, 0 empty).

---

## P3 — housekeeping, not demo-blocking

| Item | Detail |
|---|---|
| Missing canonical RFP object | Every demo run writes `proposal_documents.storage_path = {demoOrgId}/demo/canonical-demo-rfp.pdf`, which **does not exist** in Storage. Harmless today — `DocumentList` uses `storage_path` only for delete, there is no view/download affordance — so it will not 404 in the demo. It breaks the moment a view link is added, or on delete. |
| Committed `sbp_` token | `sbp_c8b850f…` is tracked in `.planning/HANDOFF.json` and `.claude/settings.local.json`. **Verified already revoked (401)** → low severity. Scrub when convenient. Note `.planning/` is tracked and not gitignored. |
| STATE.md 6 days stale | Last updated 2026-07-22; claims `demo_fixtures` is empty and no run has succeeded. Reality: fixture v1 ACTIVE (9 sections, $48M), 4 successful demo runs, 268 regulatory + 229 proposal chunks. The Phase 16 "standing verification debt" it describes is largely discharged. |
| `analyze-proposal-gaps/__tests__/` | 4 Vitest-style files that never run (excluded by config; Deno not installed). |
| 16 skipped tests | Old `expect(true).toBe(false)` placeholder stubs, pre-existing. |
| Auth | Leaked-password protection disabled (HaveIBeenPwned check). |
| Advisors | ~25 `SECURITY DEFINER` exposure WARNs incl. `vault_get_sf_tokens`/`vault_store_sf_tokens` callable by `authenticated`. Pre-existing; worth a pass post-demo. |

---

## Healthy — verified live

- Deploy drift: **none** (`origin/master..HEAD` = 0 commits).
- 0 documents stuck in `extracting`, 0 failed.
- 4/4 demo runs materialized 9 sections with 0 empty sections.
- Regulatory corpus: 5 active docs, 268 chunks. Proposal chunks: 229.
- Test suite: 542 passed / 16 skipped / 0 failed.
- Pending todos: 1 (`2026-07-08-fix-rag-chunk-embed-pipeline-zero-chunks`) — stale, chunks are non-zero now.
