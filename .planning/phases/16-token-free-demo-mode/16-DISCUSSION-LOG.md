# Phase 16: Token-Free Demo Mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 16-token-free-demo-mode
**Areas discussed:** Demo run surface, Capture surface, Presenter access model, Reset control
**Mode:** discuss (SPEC.md loaded — HOW-only; advisor mode off)

---

## Demo run surface

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse the real wizard | Drive ProposalCreationWizard + Step2/3/4 from the fixture; pixel-identical to a live run | ✓ |
| Dedicated demo runner | Separate purpose-built screen mimicking the flow | |

| Option (template) | Description | Selected |
|--------|-------------|----------|
| Pre-select + lock | Standard template card pre-selected + disabled | ✓ |
| Hide other templates | Render only the standard template | |

| Option (populate) | Description | Selected |
|--------|-------------|----------|
| Reuse real reveal | Existing per-section realtime reveal from fixture, brief delay, no fake streaming | ✓ |
| Simple sequential fill | Plain writes with a short delay, no animation | |

**Notes:** Maximizes the "indistinguishable / live conditions" goal; branching stays above the population step.

---

## Capture surface

| Option (entry) | Description | Selected |
|--------|-------------|----------|
| Button on proposal detail | super_admin "Save as demo fixture" on ProposalDetail | ✓ |
| Curated flow in admin panel | Pick source proposal id in /admin | |

| Option (source org) | Description | Selected |
|--------|-------------|----------|
| Generated in the demo org | Presenter generates + captures inside the demo org | ✓ |
| Any proposal, cross-org | Capture any real client proposal by id | |

| Option (RFP file) | Description | Selected |
|--------|-------------|----------|
| Shared canonical file | One canonical Storage object; per-run proposal_documents points at it; reset leaves the file | ✓ |
| Per-run copy | Copy the file per run; reset/sweep delete it | |
| Text only, no file | Extracted text only, no downloadable file | |

**Notes:** Confidentiality — no real client content baked into shipped fixtures. Refines SPEC Decision-C reset note: shared canonical file is retained on reset.

---

## Presenter access model

| Option (accounts) | Description | Selected |
|--------|-------------|----------|
| Single shared demo login | One shared super_admin account in the demo org | ✓ |
| Per-presenter accounts | One account per presenter | |

| Option (provision) | Description | Selected |
|--------|-------------|----------|
| Committed idempotent seed | Re-runnable seed mirroring Phase 15 bootstrap; sets feature_flags.is_demo | ✓ |
| Via the admin panel | Hand-create through /admin | |

**Notes:** Concurrency isolated by proposal + demo_runs rows despite shared created_by. Per-presenter accounts deferred.

---

## Reset control

| Option (UI) | Description | Selected |
|--------|-------------|----------|
| Remove + gate to demo | Delete vestigial global button/label; real reset only in demo run surface | ✓ |
| Keep global, rewire | Leave sidebar button, rewire for demo-org super_admin | |

| Option (target) | Description | Selected |
|--------|-------------|----------|
| Current demo run | Reset the run being presented; return to add-RFP start | ✓ (with refinements) |
| All my demo runs | Reset every active run for the account | |

| Option (999.6) | Description | Selected |
|--------|-------------|----------|
| Keep in 999.6 | Phase 16 cleans only its own demo runs; general defect stays 999.6 | ✓ |
| Fold into Phase 16 | Fix general abandoned-draft accumulation here | |

**User refinements attached to the reset target:**
1. Lookup is **run-scoped, not account-scoped** — the reset RPC takes the session's `demo_runs` id and verifies caller ownership; do not resolve "the presenter's current run" from the shared account (ambiguous by construction).
2. Bulk cleanup of abandoned runs must exist but **not on the presenter control** — it belongs in the scheduled sweep (already scoped) or an `/admin` action. Presenter button = one behavior, no modes.
3. Reset returns to the "add demo RFP" start **in-session, NO page reload** (drop `window.location.reload()`), so the presenter can immediately re-run mid-call.

---

## Claude's Discretion

- Per-section reveal delay value (D-03).
- Exact edge-fn request/response shapes and transaction boundaries within the SPEC endpoint contract.
- Whether fixture validation runs inside `demo-run-start` or a separate `demo-validate-fixture` surface (or both).

## Deferred Ideas

- General abandoned-draft cleanup (all orgs) → Backlog 999.6.
- Optional `/admin` manual bulk demo-run cleanup (beyond the scheduled sweep).
- Per-presenter demo accounts.
