# Phase 16: Token-Free Demo Mode - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

An internal, super_admin-only demo path that replays a captured proposal generation deterministically and near-instantly, while every post-generation interaction (chat, rewrite, section regeneration, export) runs the real production paths against real indexed content. This discussion covers HOW to implement; WHAT/WHY are locked by `16-SPEC.md`.
</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**10 requirements + Decisions A, B, C are locked.** See `16-SPEC.md` for full requirements, boundaries, acceptance criteria, schema, endpoints, access-control points, and the faked-vs-real inventory. Downstream agents MUST read `16-SPEC.md` before planning or implementing — requirements are not duplicated here.

**Locked decisions (SPEC):**
- **A** — Dedicated demo `organizations` row (`feature_flags.is_demo = true`) accessed by super_admin presenter accounts whose `user_profiles.org_id` is that org → zero new RLS surface, corpus isolated by construction.
- **B** — Per-proposal capture; versioned, template-bound fixtures; one `active` per template; prior versions retained + reactivatable (status flip, not recapture).
- **C** — Clone pre-computed RFP embeddings per run into `chunks` under the fresh `proposal_id` (pure server-side INSERT…SELECT, no run-time embedding call); `chunks.proposal_id` FK CASCADE removes them on delete.

**In scope (from SPEC):** super_admin server gate; capture tool; versioned fixtures (+children); real RFP ingest with clone-per-run replay; presenter run flow (add-RFP → extract fields → extract assumptions → standard-template select → sequential populate); fixture validation with loud setup failure; DB-deleting reset; draft-only lifecycle + scheduled sweep; faked/real inventory.
**Out of scope (from SPEC):** any demo branching below the population step; multi-template demo selection; simulated token streaming; changes to generate/retrieve/chat/rewrite/regenerate/export logic; public/self-serve demo; billing of demo runs. **Also out (this discussion):** the general non-demo abandoned-draft cleanup → stays Backlog 999.6.
</spec_lock>

<decisions>
## Implementation Decisions

### Demo run surface
- **D-01:** Reuse the **real** creation flow (`src/components/ProposalCreationWizard.tsx` + `wizard/Step2DocumentUpload.tsx`, `Step3AssumptionReview.tsx`, `Step4Generate.tsx`) driven from the fixture, so the demo is visually indistinguishable from a live run. All demo branching lives **above** the population step (allowed by SPEC "no demo branching below population").
- **D-02:** Standard-template restriction enforced by **pre-select + lock**: show the "Standard Proposal" template card already selected and disabled in `Step4Generate`; the presenter can point to it but cannot choose another (and cannot select a template with no fixture).
- **D-03:** The "generate" step **reuses the real per-section reveal** — sections fill one-by-one via the existing `useProposalGeneration` realtime/section-status UI, sourced from the fixture with a brief **fixed per-section delay**, **no fake token streaming**. Presenter verbally notes real runs are slower.

### Capture surface
- **D-04:** Capture entry point is a **super_admin-only "Save as demo fixture" action on the proposal detail page** (`src/pages/ProposalDetail.tsx`), invoking the `demo-capture-fixture` service-role edge fn with the proposal id.
- **D-05:** Fixtures are captured **from a proposal generated inside the demo org** (the presenter generates one real proposal in the demo org, then captures it). Keeps `org_id` consistent and guarantees **no real client content is ever baked into a shipped fixture** (confidentiality). Cross-org capture is deliberately not built.
- **D-06:** The demo RFP source file is a **shared canonical Storage object** referenced by the fixture; each run's `proposal_documents` row points at it. **Reset/sweep delete the per-run `proposal_documents` row (+ cascaded `document_extracts`) but NOT the shared canonical file.** No per-run file duplication. (This refines the SPEC Decision-C reset note: only per-run-*owned* Storage would be deleted — with a shared canonical file there is none to delete.)

### Presenter access model
- **D-07:** **Single shared demo super_admin login** in the demo org for v1 (small internal team). Concurrent runs stay isolated by separate `proposals` + `demo_runs` rows even though `created_by` is the same account. Design keeps per-presenter accounts possible later without rework.
- **D-08:** Demo org + presenter account provisioned by a **committed, idempotent seed** (mirroring the Phase 15 super_admin bootstrap), setting `organizations.feature_flags.is_demo = true`. Reproducible on any environment, safe to re-run. Not hand-created via the admin panel.

### Reset control
- **D-09:** **Remove the vestigial global "Reset Demo" button and "jamo Demo v0.1.0" label** (`src/components/Sidebar.tsx:119-132`, and the duplicate label in `src/components/ProposalContentsSidebar.tsx:101`) for all users. A real reset appears **only inside the demo run surface** for the demo-org super_admin.
- **D-10:** Reset targets the **current session's run**, identified by the **`demo_runs` id passed from the client session** (caller-verified against demo org + draft + ownership) — **not** an account-inferred "current run" (ambiguous under a shared login). It hard-deletes that run's proposal + children + per-run `proposal_documents`/`document_extracts`; leaves the shared canonical RFP file.
- **D-11:** Reset returns to the **"add demo RFP" start in-session with NO page reload** (drop the old `window.location.reload()` pattern) so the presenter can immediately re-run mid-call. The presenter control has **one behavior, no modes**.
- **D-12:** **Bulk cleanup of abandoned runs** (crashed tabs / closed browsers) is **not** on the presenter control — it lives in the scheduled **sweep** (SPEC Req 9), with an optional `/admin` manual bulk-cleanup action as a nicety (see Deferred).

### Claude's Discretion
- Exact per-section reveal delay value (D-03) — pick something that reads as "working" without dragging (~a few hundred ms/section); tune during implementation.
- The precise `demo-capture-fixture` / `demo-run-start` / `demo-reset` request/response shapes, transaction boundaries, and error surfaces — planner/researcher decide within the SPEC's endpoint contract.
- Whether validation (SPEC Req 7) runs inside `demo-run-start` or a separately-surfaced `demo-validate-fixture` check in the capture/admin UI (or both).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements (read first)
- `.planning/phases/16-token-free-demo-mode/16-SPEC.md` — Locked requirements, Decisions A/B/C, schema (new tables `demo_fixtures`, `demo_fixture_sections`, `demo_fixture_assumptions`, `demo_fixture_rfp_chunks`, `demo_runs`), endpoints, access-control points, faked-vs-real inventory. **MUST read before planning.**
- `.planning/phases/15-client-onboarding-provisioning/15-SPEC.md` — super_admin bootstrap + provisioning model to mirror for the demo-org seed (D-08).

### Demo run surface (reuse targets)
- `src/components/ProposalCreationWizard.tsx` — wizard to drive from fixture (D-01); note draft is created eagerly on step 1 (relevant to demo-run proposal creation).
- `src/components/wizard/Step2DocumentUpload.tsx` — DB-backed; polls `proposal_documents` (needs a materialized row per run, D-06).
- `src/components/wizard/Step3AssumptionReview.tsx` — renders assumptions from reducer state.
- `src/components/wizard/Step4Generate.tsx` §181-186, §26-100 — template pre-select/lock (D-02).
- `src/hooks/useProposalGeneration.ts` §322-349, §443-517 — realtime section reveal to reuse for population (D-03).
- `supabase/functions/generate-proposal-section/index.ts` §64-78 (`writeSectionById`) — the write pattern demo population mirrors.

### Capture + retrieval + clone
- `supabase/functions/extract-document/index.ts` — real ingest (chunks + embeddings) the capture snapshots.
- `supabase/functions/retrieve-context/index.ts`; `supabase/migrations/20260710000003_proposal_rpc_eligibility.sql`; `supabase/migrations/20260708000004_regulatory_match_rpcs.sql` — retrieval sources + draft eligibility.
- `supabase/migrations/20260710000001_chunks_proposal_scope_columns.sql` §7-9 — `chunks.proposal_id` FK CASCADE (clone-per-run + auto-cleanup, D-06/Decision C).

### Access control + gate pattern
- `supabase/functions/_shared/auth.ts` §64-104 (`getAuthedUserAndOrg`) — JWT identity + service-role role lookup.
- `supabase/functions/admin-create-org/index.ts` §44-53 — canonical super_admin 403 gate to mirror on all demo endpoints.
- `supabase/migrations/20260305000012_rls_helper_functions.sql`, `20260305000013_rls_policies.sql`, `20260714000000_harden_profile_role_rls.sql` — org-scoped RLS + role integrity (demo tables mirror these).

### UI cleanup
- `src/components/Sidebar.tsx` §119-132 and `src/components/ProposalContentsSidebar.tsx` §101 — vestigial "Reset Demo" button + "jamo Demo v0.1.0" labels to remove (D-09).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ProposalCreationWizard` + Step2/3/4** — the entire presenter flow reuses these unchanged in shape; a "demo driver" feeds fixture data and skips LLM calls (D-01).
- **`useProposalGeneration` realtime reveal** — reuse for the paced section fill (D-03) rather than building a new animation.
- **`getAuthedUserAndOrg` + `admin-create-org` gate** — copy the exact super_admin server-gate pattern for every demo endpoint.
- **`chunks.proposal_id` CASCADE** — makes clone-per-run + reset cleanup of embeddings automatic.

### Established Patterns
- Org-scoped RLS via `private.get_user_org_id()` — the dedicated demo org + demo-org accounts make all existing policies apply unmodified (Decision A).
- Draft is a hard first-evaluated retrieval floor — demo proposals stay `draft`, so own-proposal retrieval works and no cross-proposal leak is possible.
- Proposal status is set only at create (`draft`) and via `StatusSelector`; the demo path never invokes `StatusSelector`.

### Integration Points
- New super_admin-only edge fns: `demo-capture-fixture`, `demo-run-start`, `demo-reset`, sweep (scheduled edge fn), optional `demo-validate-fixture`.
- New DB tables (5) + a committed demo-org/account seed.
- Frontend: capture button on `ProposalDetail`; demo-run entry (reusing the wizard) behind a super_admin/demo-org gate; removal of vestigial sidebar controls.
</code_context>

<specifics>
## Specific Ideas

- Reset must be **modeless** for the presenter — one button, one behavior (reset THIS run, in-session, no reload). Explicitly avoid inheriting `window.location.reload()`.
- Reset lookup is **run-scoped, not account-scoped** — pass the session's `demo_runs` id; do not resolve "the current run" from the shared account server-side.
- Capture stays inside the demo org so **no real client data** is ever embedded in a shipped fixture.
</specifics>

<deferred>
## Deferred Ideas

- **General abandoned-draft cleanup (all orgs)** → **Backlog 999.6** (verified pre-existing production defect; drafts created eagerly on wizard step 1, no cleanup anywhere; Test Org A has 60 drafts). Deliberately NOT in Phase 16.
- **Optional `/admin` manual bulk demo-run cleanup action** — a convenience beyond the scheduled sweep for clearing abandoned demo runs on demand. Nice-to-have; the scheduled sweep (SPEC Req 9) already covers correctness. Revisit if presenters need on-demand bulk cleanup.
- **Per-presenter demo accounts** — deferred from D-07; add later if per-person audit/ownership is wanted. Design supports it without rework.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 16.
</deferred>

---

*Phase: 16-token-free-demo-mode*
*Context gathered: 2026-07-20*
