# Phase 16: Token-Free Demo Mode — Specification

**Created:** 2026-07-20
**Status:** DRAFT — Decisions A, B, C locked (see "Decisions"); ready for /gsd-discuss-phase 16.
**Prerequisite:** Phase 15 (Client Onboarding & Provisioning) — super_admin bootstrap + provisioning path (the dedicated demo org + its super_admin presenter account are provisioned by extending this); Phase 14.3 (Edge Identity Hardening) — JWT-derived identity in edge functions.
**Related:** Backlog 999.6 (abandoned-draft accumulation) — a pre-existing production defect this phase surfaced; tracked separately, not in scope here.

## Goal

An **internal-only** demo path that reproduces an end-to-end proposal generation with **deterministic content** and **near-zero latency** for the initial full generation, while keeping **every post-generation interaction real**. The primary goals are determinism and speed under live client conditions; token savings are a secondary benefit. Below the population step there is **no demo branching** — chat, rewrites, section regeneration, and export run the exact production paths against real indexed content.

## Background — verified current state

All facts below were confirmed at code level (file:line) during spec research.

### Generation is per-section and LLM-driven
- Generation runs **one section at a time**, sequentially, in `generateAll` (`src/hooks/useProposalGeneration.ts:443`): fetch approved assumptions → fetch `proposal_sections` ordered by `position` → `for (const section of sections)` → `retrieve-context` → `streamSection` → extract a "consistency anchor" to feed the next section.
- Each section streams from Anthropic `claude-sonnet-4-6` in edge fn `supabase/functions/generate-proposal-section/index.ts:114`. On flush it calls `writeSectionById` (`:64`), an **UPDATE** of `proposal_sections` setting `content`, `status='complete'`, `generated_at` by row `id` (`:71-78`), and inserts a `usage_events` row (`:344`).
- Realtime subscription on `proposal_sections` (`useProposalGeneration.ts:322-349`) pushes completed content to the UI.

### Section content is an HTML string with placeholder spans — not TipTap node UniqueIDs
- `proposal_sections.content TEXT` holds a **rendered HTML string** (not JSON), despite the column comment. Base schema `supabase/migrations/20260305000005_proposal_sections.sql:1-17`; columns since extended with `name, description, position, role` (`20260427000024`), `last_saved_content` (`20260326000018`), `compliance_flags JSONB` (`20260402000021`).
- "UniqueID attributes" in the original request map to **placeholder marks**: the edge fn wraps fill-ins in `<span data-placeholder-id="{crypto.randomUUID()}" data-placeholder-label="{label}">` (`generate-proposal-section/index.ts:56-59, 326-338`); the TipTap `PlaceholderMark` extension (`src/components/editor/extensions/PlaceholderMark.ts:104-120`) reads/writes those attrs. **The IDs live inside the `content` HTML** — so capturing `content` verbatim preserves them. There is no separate JSON document to capture.
- No per-section citation/source data is stored on sections. Citations exist only in **chat** (`src/components/chat/CitationsBlock.tsx`). The only per-section metadata is `compliance_flags JSONB`.

### Templates and the "standard" template
- `templates` (`20260418000023_templates.sql:8-19`) + `template_sections` (`:26-35`). The standard template is `is_default = true` — the seeded **"Standard Proposal"**, fixed UUID `00000000-0000-0000-0000-000000000001`, 9 sections (`20260427000024:33-80`). Enforced single-default via partial unique index `templates_single_default`.
- On generate, the wizard writes `proposals.selected_template_id`, reads `template_sections`, and **upserts one `proposal_sections` row per template section** (`src/components/ProposalCreationWizard.tsx:220-255`): `section_key='section-{position}'`, `content=''`, `status='pending'`, copying `name/description/role/position`.

### RFP fields, assumptions, RFP text
- Structured RFP/study fields are **columns on `proposals`** (`client_name, therapeutic_area, study_phase, study_type, indication, due_date, estimated_value, services_requested[], geography[]`), plus `services/investigationalProduct/investigationalProductUndisclosed` JSON-stuffed into `proposals.description` (`ProposalCreationWizard.tsx:153,215`).
- Assumptions → `proposal_assumptions` (`20260305000008:1-16`): `proposal_id, org_id, category, content, confidence, status, user_edited, source_document`. Generation consumes only `status='approved'` (`useProposalGeneration.ts:230-244`). The `extract-assumptions` edge fn **returns JSON only; the frontend persists** the rows.
- Raw RFP text → `document_extracts.content TEXT` (`20260305000007`), keyed to `proposal_documents`.

### Ingest pipeline writes real chunks + embeddings
- `supabase/functions/extract-document/index.ts`: writes `document_extracts`, sets `proposal_documents.parse_status`, then `chunkAndEmbedProposal` (`:45`) embeds via OpenAI `text-embedding-3-small` (1536 dims) and inserts into **`public.chunks`** (`:84`): `org_id, doc_type='proposal', proposal_id, source, content, embedding vector(1536), metadata`.
- `chunks` (`20260320000015` + `20260710000001` + `20260708000002`): `doc_type CHECK IN ('regulatory','proposal')`, `embedding vector(1536)`, `proposal_id uuid FK→proposals ON DELETE CASCADE`, RLS `org_id = user's org`.

### Retrieval sources (what the demo org must contain)
`retrieve-context` (`supabase/functions/retrieve-context/index.ts`) queries **two tiers of the single `chunks` table**, `SIMILARITY_THRESHOLD=0.65`, K=5 each:
1. **Regulatory** — `match_chunks_vector/fts`, `doc_type='regulatory'`, scoped `WHERE (c.org_id = filter OR c.org_id IS NULL)`, joined to `regulatory_documents` where `status='active'` (`20260708000004`). The seeded ICH corpus is **global (`org_id IS NULL`)**, so it is available to the demo org with **no per-demo-org seeding**.
2. **Proposal history** — `match_chunks_vector/fts_proposals`, `doc_type='proposal'`, **strictly org-scoped** `WHERE c.org_id = org_id_filter` + per-proposal eligibility (`20260710000003`).
- The uploaded RFP's own chunks are returned via the **own-proposal branch** `c.proposal_id = current_proposal_id` (any status).
- **Template content is NOT a retrieval source.**

### Draft is a hard confidentiality floor
Inside `20260710000003_proposal_rpc_eligibility.sql`, other proposals require `p.status <> 'draft'` as a **first-evaluated hard floor** — no `reference_override` or org master-switch can lift a draft. A draft proposal's chunks return **only** to its own retrieval (`c.proposal_id = current_proposal_id`). `NULL current_proposal_id` is fail-closed.

### Status is free-text TEXT; only two sites set it
`proposals.status TEXT NOT NULL DEFAULT 'draft'` (no enum/CHECK). Current values: `draft, submitted, won, lost` (`src/types/proposal.ts:1`). **Set at exactly two places:** create (always `'draft'` — `ProposalCreationWizard.tsx:150,212`, `ProposalEditorModal.tsx:111`, funneling through `ProposalsContext.tsx:93`) and `StatusSelector` → `ProposalsContext.tsx:120`. **No edge function sets proposal lifecycle status.** Nothing in ingest/generation/chat can flip a proposal off `draft`.

### Access control
- Roles TEXT (`super_admin/admin/user`) on `user_profiles` (`20260305000003:5-6`), one profile per user, one org per profile (`org_id NOT NULL`).
- Server-side identity: `getAuthedUserAndOrg()` (`supabase/functions/_shared/auth.ts:64-104`) verifies the JWT (`auth.getUser()`), then service-role looks up `org_id`/`role` from `user_profiles` by the verified `user.id`. **Never from the request body.**
- Canonical super_admin gate (verbatim `admin-create-org/index.ts:44-53`): re-read `role` from DB for the JWT-verified user; `if (role !== 'super_admin') return 403`.
- RLS helpers `private.get_user_org_id()` / `private.get_user_role()` (`20260305000012`). **No `is_super_admin()`**; policies inline the role check. The **only** cross-org super_admin bypass is `orgs_super_admin` on the `organizations` table (`20260305000013:17-19`) — **proposal tables have no super_admin cross-org bypass.**
- `super_admin` is **global/cross-org**. Frontend gate `SuperAdminRoute.tsx:21` (cosmetic); server is authoritative. Edge fns invoked via `supabase.functions.invoke` (auto-attaches session JWT).
- **No demo/special/internal org or hardcoded org UUID exists** today (Phase 15 introduced `admin-create-org`).

### Current "Reset Demo" control — reported behavior (as requested)
`src/components/Sidebar.tsx:119-132`. It is an inline handler, **not** a named function:
```jsx
<button onClick={() => { sessionStorage.clear(); window.location.reload() }}>… Reset Demo</button>
```
**It clears `sessionStorage` and reloads the page. It deletes zero database rows.** (`sessionStorage` holds in-progress draft editor state per CONCERNS BUG-1.) A duplicate `jamo Demo v0.1.0` label with **no** button exists at `ProposalContentsSidebar.tsx:101`. There is no other reset control.

---

## Requirements

### 1. Server-side super_admin gate on all demo functionality
- **Current:** No demo endpoints. Super_admin gate pattern exists (`admin-create-org:44-53`).
- **Target:** Every demo endpoint (capture, run-start, reset, fixture list) calls `getAuthedUserAndOrg(req)` then re-reads role from `user_profiles` and returns `403` unless `super_admin`. No client-supplied role/flag participates. Demo UI entry points render only for `super_admin` (behind `SuperAdminRoute`), but the server check is authoritative.
- **Acceptance:** A crafted request to any demo endpoint from an `admin`/`user`/unauthenticated caller returns 403/401 regardless of body contents; the UI shows no demo affordances to non-super_admins.

### 2. Fixture capture tool (admin-only, versioned records)
- **Current:** None.
- **Target:** A super_admin action `demo-capture-fixture` that exports a **live** proposal into a versioned `demo_fixtures` record (never hand-edited files). The fixture captures: (a) extracted RFP fields (snapshot of `proposals` study columns + `description` JSON), (b) extracted assumptions (from `proposal_assumptions`), (c) all section rows with their **full `content` HTML including `data-placeholder-id` spans** and `compliance_flags`, (d) the RFP source (extracted text + the pre-computed RFP `chunks` incl. embeddings, for replay). Each capture writes a **new version** bound to the source proposal's `template_id`.
- **Acceptance:** Capturing a real generated proposal produces one `demo_fixtures` row (+ children) with a monotonic `version`; re-capturing produces a new version, not an overwrite; the fixture is reconstructable with no reference to the original proposal.

### 3. Demo RFP goes through the real ingest pipeline
- **Current:** N/A.
- **Target:** The demo RFP is genuinely ingested once (real `extract-document`: chunk + embed via `text-embedding-3-small`) so retrieval hits **real indexed content**. Its chunks (content + embeddings) are stored in the fixture and, at each demo run, **cloned into `chunks` under the run's fresh `proposal_id`** and the demo org (pure INSERTs, no model calls) so the own-proposal retrieval branch (`c.proposal_id = current_proposal_id`) returns them. Regulatory retrieval relies on the existing **global** ICH corpus (no demo-org seeding needed). Retrieval sources are confirmed to be exactly: RFP-own proposal chunks + global regulatory corpus (template content is not retrieved).
- **Acceptance:** Post-generation chat/rewrite on a demo proposal returns real RFP-derived and regulatory citations; the embeddings are genuine (not stubbed); no live embedding call occurs at run time.

### 4. Presenter-facing demo run flow
- **Current:** N/A.
- **Target:** A super_admin, from the demo entry point, drives: **(a) "Add demo RFP"** — presents the stored RFP as if just uploaded; **(b) document-extraction step** — surfaces the fixture's extracted RFP fields; **(c) assumption-extraction step** — surfaces the fixture's saved assumptions; **(d) template selection** — restricted to the standard template only; **(e) generate** — populates all sections from the fixture via **simple sequential section fill with a brief per-section delay, no simulated token streaming.** The presenter verbally notes real generation is slower.
- **Acceptance:** The sequence runs end-to-end with deterministic content; population is sequential with a visible per-section delay and no fake streaming; template choice is the standard template only.

### 5. Fresh, isolated proposal per run
- **Current:** N/A.
- **Target:** Each demo run mints a **fresh `proposals` row** (`created_by` = running user, `status='draft'`, `selected_template_id` = standard) in the demo org, with its own `proposal_sections`, `proposal_assumptions`, cloned RFP chunks, and a `demo_runs` tracking row. Concurrent runs by different super_admins produce independent proposals that never collide.
- **Acceptance:** Two super_admins running demos simultaneously each get their own proposal_id; neither run mutates the other's rows.

### 6. Post-generation is indistinguishable and unbranched
- **Current:** N/A.
- **Target:** Once populated, the demo proposal is structurally identical to a real draft. Chat, rewrites, section regeneration, and export run the **normal production code paths** with **no demo-aware conditional below the population step**.
- **Acceptance:** A code search finds no demo branch in chat/rewrite/regenerate/export paths; those features behave identically on a demo proposal and a real draft.

### 7. Fixture validation before a run
- **Current:** N/A.
- **Target:** Before a run begins, validate the active fixture against the **current** standard template: every `template_sections` role/position must be present in the fixture, and the fixture schema must match. Any missing section or schema mismatch **fails loudly at setup** with a clear message. Never render a blank section mid-demo.
- **Acceptance:** Removing/renaming a template section (or a fixture schema drift) causes run-start to abort pre-population with an explicit error naming the offending section; no partial/blank population occurs.

### 8. Reset deletes the demo proposal and returns to pre-upload state
- **Current:** Reset button clears `sessionStorage` + reloads; deletes no rows (§Background).
- **Target:** In demo mode, wire the (now demo-scoped) reset control to call `demo-reset` with the **session's `demo_run_id`** (run-scoped, caller-verified — CONTEXT D-10), which **hard-deletes that demo run's proposal and all associated records** and returns the user to the pre-upload start **in-session, no page reload** (CONTEXT D-11). Cascade covers `proposal_sections`, `proposal_assumptions`, cloned `chunks`, `proposal_chats`, `chat_sessions`, `proposal_section_versions`. **Explicit delete required** (not covered by cascade — see Decision C): the run's `proposal_documents` (cascades `document_extracts`; its FK to `proposals` is SET NULL). The **shared canonical RFP Storage file is retained** (referenced, not owned — CONTEXT D-06). The vestigial global "Reset Demo" button/label is removed for all users (CONTEXT D-09).
- **Acceptance:** After reset, that run's proposal and **every** per-run associated row (sections, assumptions, cloned chunks, `proposal_documents`, `document_extracts`, `demo_runs`) are gone — no orphaned embeddings or document rows; the shared canonical RFP file remains; the UI is back at the "Add demo RFP" start **without a page reload**; reset refuses to touch any non-demo proposal or another session's run.

### 9. Demo proposals stay draft and are swept
- **Current:** N/A.
- **Target:** Demo proposals remain `status='draft'` and are therefore **structurally excluded from cross-proposal retrieval** (draft hard floor, §Background). The spec states explicitly: no demo-path code sets a demo proposal to a non-draft status (create + `StatusSelector` are the only setters; the demo path never invokes `StatusSelector`). Abandoned demo proposals are swept on a schedule (recommended: **hourly, deleting demo-org proposals referenced by `demo_runs` older than 24h**). The sweep must mirror `demo-reset`'s **full** cleanup (Decision C orphan caveat), including the explicit `proposal_documents`/`document_extracts` delete and Storage-object removal — so it should be a **scheduled edge function** (which can call the Storage API), not a pure pg_cron SQL job (which cannot delete Storage objects and would leave orphaned files).
- **Acceptance:** A demo proposal's chunks never appear in another proposal's retrieval; a demo proposal older than the sweep threshold is removed automatically; no code path can flip a demo proposal off `draft`.

---

## Schema changes (new)

All new tables are demo-org-scoped and super_admin-only (RLS: `private.get_user_role() = 'super_admin'`; mutations only via service-role edge fns).

1. **`demo_fixtures`** — `id uuid PK, template_id uuid NOT NULL REFERENCES templates(id), version int NOT NULL, label text, status text CHECK (status IN ('active','archived')) DEFAULT 'active', source_proposal_id uuid, rfp_fields jsonb NOT NULL, rfp_extract_text text, org_id uuid NOT NULL, captured_by uuid REFERENCES user_profiles(id), created_at timestamptz DEFAULT now()`. `UNIQUE(template_id, version)`; partial unique index (one `active` per `template_id`).
2. **`demo_fixture_sections`** — `id uuid PK, fixture_id uuid NOT NULL REFERENCES demo_fixtures(id) ON DELETE CASCADE, role text NOT NULL, position int NOT NULL, section_name text NOT NULL, content text NOT NULL, compliance_flags jsonb`. `UNIQUE(fixture_id, position)`.
3. **`demo_fixture_assumptions`** — `id uuid PK, fixture_id uuid FK ON DELETE CASCADE, category text, content text NOT NULL, confidence text, status text DEFAULT 'approved', user_edited boolean DEFAULT false`.
4. **`demo_fixture_rfp_chunks`** — `id uuid PK, fixture_id uuid FK ON DELETE CASCADE, source text, content text NOT NULL, embedding vector(1536), metadata jsonb`. (Pre-computed real embeddings for clone-per-run.)
5. **`demo_runs`** — `id uuid PK, proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE, fixture_id uuid REFERENCES demo_fixtures(id), started_by uuid REFERENCES user_profiles(id), org_id uuid NOT NULL, created_at timestamptz DEFAULT now()`. Drives concurrency isolation, reset targeting, and the sweep.

**Marking the demo org:** `organizations.feature_flags` jsonb set to `{"is_demo": true}` on the designated org — **no schema change** (column already exists).

## New endpoints / RPCs (all super_admin-gated, service-role)

- **`demo-capture-fixture`** (edge fn) — input `source_proposal_id`. Validates against the source's template, then snapshots `proposals` fields, `proposal_assumptions`, `proposal_sections` (`content` + `compliance_flags`), `document_extracts`, and the RFP `chunks` (`doc_type='proposal'`, `proposal_id=source`) into a new `demo_fixtures` version. Returns `fixture_id, version`.
- **`demo-run-start`** (edge fn) — input `template_id` (must be `is_default`). Loads the **active** fixture, runs validation (Req 7), then in one transaction: create `proposals` (demo org, `created_by`=caller, `status='draft'`, `selected_template_id`), create `proposal_sections` from `template_sections`, write section `content`/`status='complete'`/`generated_at` from the fixture, insert `proposal_assumptions` (approved), **materialize a `proposal_documents` row (+ `document_extracts` from `rfp_extract_text`) for the demo RFP, pointing at the shared canonical RFP Storage file (CONTEXT D-06)** — required because the document-extraction step UI (`Step2DocumentUpload.tsx:29-31`) is DB-backed and polls `proposal_documents` — clone `demo_fixture_rfp_chunks` into `chunks` under the new `proposal_id`, insert `demo_runs`. Returns `proposal_id`. (Per-section pacing/delay is a **frontend** reveal concern; the server writes atomically to avoid mid-demo partial state.)
- **`demo-reset`** (edge fn) — input **`demo_run_id`** (the session's run — run-scoped, not account-inferred; CONTEXT D-10). Asserts caller super_admin, the run's proposal is in the demo org + `status='draft'`. Deletes: the `proposals` row (FK-cascades `proposal_sections`, `proposal_assumptions`, `chunks(proposal)`, `proposal_chats`, `chat_sessions`, `proposal_section_versions`) **plus an explicit delete** of the run's `proposal_documents` row (cascades `document_extracts`; its FK to `proposals` is **SET NULL**, not cascade) plus the `demo_runs` row. **The shared canonical RFP Storage file is referenced by every run, not owned by one — it is retained, never deleted** (CONTEXT D-06). Returns the UI to the pre-upload start **in-session, no page reload** (CONTEXT D-11). (`usage_events` from post-gen chat SET-NULL and are left as billing telemetry.)
- **Fixture validation** — shared routine (in `demo-run-start` and a `demo-validate-fixture` check surfaced in the capture/admin UI) comparing fixture section roles/positions to current `template_sections`.
- **Sweep** — **scheduled edge function** (hourly, triggered by pg_cron `net.http_post` or Supabase cron) that applies `demo-reset`'s cleanup to demo-org proposals referenced by `demo_runs` older than the threshold (per-run rows only; the shared canonical RFP file is retained). Bulk cleanup lives here (and optionally an `/admin` action), never on the presenter reset control (CONTEXT D-12).

## Access-control enforcement points (authoritative list)

1. Every demo edge fn: JWT verify (`getAuthedUserAndOrg`) + service-role `user_profiles.role === 'super_admin'` re-check → 403 otherwise.
2. RLS on `demo_fixtures`, `demo_fixture_sections`, `demo_fixture_assumptions`, `demo_fixture_rfp_chunks`, `demo_runs`: super_admin-only; no anon/authenticated write.
3. `demo-run-start` binds `org_id` = demo org and `created_by` = verified caller **server-side**; never from body.
4. `demo-reset` triple-guard: super_admin + demo org + `status='draft'` + `demo_runs` membership.
5. UI: demo entry points wrapped in `SuperAdminRoute` (cosmetic hide) — not a substitute for the server gate.

## What is FAKED vs REAL (auditable boundary)

**FAKED (at/above the population step — replayed from fixture, no LLM calls):**
- Section body content of the initial full generation (from `demo_fixture_sections`, not `generate-proposal-section`).
- The extracted RFP fields and assumptions shown in the extraction steps (fixture snapshots, not live `extract-document`/`extract-assumptions` calls).
- The "upload" of the demo RFP (a stored file presented as if uploaded).
- The per-section population delay (cosmetic pacing; no token streaming).

**REAL (from the population step down — production paths, live calls):**
- RFP indexing: real chunks + real `text-embedding-3-small` embeddings (genuine one-time ingest, cloned per run) in a real org.
- Post-generation chat, rewrites, section regeneration, export — unmodified production code, live Anthropic calls, live `retrieve-context`.
- Retrieval against real indexed content: RFP-own chunks + global regulatory corpus.
- The `proposals`/`proposal_sections`/`proposal_assumptions` rows — real, structurally identical to a real draft.
- Access control (server-side super_admin) and draft-status confidentiality (RLS + eligibility RPCs).

## Boundaries

**In scope:** super_admin server gate; capture tool; versioned fixtures (+ children); real RFP ingest with clone-per-run chunk replay; presenter run flow (add-RFP → extract fields → extract assumptions → standard-template select → sequential populate); fixture validation with loud setup failure; DB-deleting reset wired to the existing control in demo mode; draft-only lifecycle + scheduled sweep; explicit faked/real inventory.

**Out of scope:** any demo branching below population; multi-template demo selection (standard template only in v1); simulated token streaming; changes to `generate-proposal-section`, `retrieve-context`, chat, rewrite, regenerate, or export logic; a public/self-serve demo (this is internal super_admin-only); billing/usage metering of demo runs; theming of the demo UI beyond functional presenter controls.

## Constraints

- Hosted Supabase, project ref `fuuvdcvbliijffogjnwg`; RLS org-isolation must remain intact.
- Migrations applied via Supabase Management API / MCP (`supabase db push` is diverged here); commit repo migration files too.
- Edge functions must be **explicitly deployed** after landing.
- Roles fixed: `super_admin/admin/user`. One profile per user, one org per profile (no multi-org membership).
- Embeddings: `text-embedding-3-small`, 1536 dims — clone must preserve vector dimensionality and `metadata` shape.
- Section content is HTML (with `data-placeholder-id` spans), captured verbatim; do not attempt to re-serialize to JSON.

## Decisions (locked)

**Decision A — Dedicated demo org with its own super_admin presenter accounts. [LOCKED]**
The demo runs in a **dedicated `organizations` row** (marked `feature_flags = {"is_demo": true}`), and presenters log into **super_admin accounts whose `user_profiles.org_id` is that demo org**. When a presenter is signed in, `private.get_user_org_id()` returns the demo org, so every existing org-scoped RLS policy and both proposal-retrieval RPCs filter to the demo org **unmodified** — **zero new cross-org policy surface** — and the demo super_admin gate still passes.

*Why not collapse demo into the internal org (the earlier recommendation, now rejected):* that solved presenter visibility but created a **confidentiality** hole. Demo-time retrieval is org-scoped, so it would run against the **internal org's** corpus. Any non-draft proposal ever sitting in that org is retrieval-eligible (`p.status <> 'draft'` + `learn_from_*`/override), and could surface **live, in front of a client, mid-rewrite** — the exact failure the eligibility system exists to prevent, made worse by an external audience. The draft hard-floor protects demo *proposals from being read*; it does nothing to stop the demo from *reading* internal content. A dedicated org isolates the corpus by construction.

*Verified (2026-07-20):* The internal super_admin org (`Jamo Internal`, `6781e2a6-305a-42e2-8016-703222098cb8`) currently holds **zero proposals** — so collapsing would be safe *today*, but the risk is structural/forward-looking, not current. (For reference, `Test Org A` holds 60 draft + 2 submitted + 2 won + 1 lost; those non-drafts are exactly the kind of live-eligible content that must never share an org with a demo.) The dedicated-demo-org approach was confirmed to require **no RLS change** — it is a normal org accessed by normal (super_admin) accounts.

*Provisioning implications (for discuss-phase):* need a way to create the demo org + its super_admin presenter account(s) reproducibly (extend the Phase 15 bootstrap/seed). Minor open sub-point: a demo presenter account is a **global super_admin** credential (via the `orgs_super_admin` bypass it can *list* all orgs — org metadata only, not other orgs' proposal content). Acceptable per this decision; if least-privilege is wanted later, the alternative is relaxing the demo gate to "super_admin OR member of an `is_demo` org," which re-adds gate surface — deliberately not taken now.

**Decision B — Per-proposal capture; versioned, template-bound; one active per template; prior versions retained & reactivatable. [LOCKED]**
Capture operates on one real proposal (the source of truth), producing a `demo_fixtures` record keyed to that proposal's `template_id` with a monotonic `version`. Multiple versions may exist per template; exactly **one is `active`**. A demo run for the standard template loads that template's active fixture. **All prior versions are retained**; activating an earlier version is a **status flip (`archived` ↔ `active`), not a recapture** — so a bad capture is a one-click rollback, not a redo. Enforced by the partial unique index (one `active` per `template_id`). Pure per-template is the degenerate case of one active version.

**Decision C — Clone pre-computed RFP embeddings per run. [LOCKED — shape verified]**
RFP chunks are **cloned per run** under the fresh `proposal_id` (not shared), because the own-proposal retrieval branch matches on `proposal_id` and the draft hard-floor blocks any cross-proposal sharing of a draft's chunks. Cloning pre-computed embeddings keeps retrieval real *and* near-zero-latency. Rejected alternative: a persistent non-draft "reference" proposal in the demo org — contradicts the draft-only lifecycle and re-introduces the eligibility surface.

Code-level shape confirmed (2026-07-20):
- **`chunks.proposal_id` is a direct column**, FK → `proposals(id)` **ON DELETE CASCADE** (`20260710000001_chunks_proposal_scope_columns.sql:7-9`). So deleting a demo proposal auto-removes its cloned chunks — **no orphaned embeddings** from the `chunks` table.
- **Copying `chunks` rows alone is sufficient for retrieval.** The proposal RPCs (`20260710000003_proposal_rpc_eligibility.sql:41-62`) join only `proposals` + `organizations`; they do **not** join `proposal_documents`/`document_extracts`. Clone must supply `org_id, doc_type='proposal', source, content, embedding, proposal_id` (+ `metadata`); `search_vector` (tsvector) is **trigger-maintained** and auto-recomputes on insert (do not hand-copy); `id`/`created_at` default.
- **No UNIQUE/exclusion constraint** on `chunks.content`/`embedding` — duplicate content across proposals is allowed, so the clone won't collide.
- **The clone must be a server-side RPC doing a pure `INSERT … SELECT` row copy — no embedding/model call at run time** (the vectors already exist in `demo_fixture_rfp_chunks`).
- **Orphan caveat for reset/sweep (must handle explicitly):** deleting a `proposals` row cascades `proposal_sections`, `proposal_assumptions`, `chunks(proposal)`, `proposal_chats`, `chat_sessions`, `proposal_section_versions` — but **`proposal_documents.proposal_id` is SET NULL** (`20260305000006:4`), so its rows and their `document_extracts` **survive**, and **Storage objects in the `documents` bucket are never deleted by any proposal-delete path**. `usage_events.proposal_id` is also SET NULL (survives). Therefore `demo-reset`/sweep must **explicitly delete** each run's `proposal_documents` (+ cascaded `document_extracts`); otherwise every demo run leaves orphaned document rows (chunks/embeddings themselves are fine via cascade). **The RFP Storage file is a shared canonical object referenced by every run (CONTEXT D-06), so it is retained — not deleted per run.** See updated Req 8.

## Acceptance Criteria

- [ ] All demo endpoints reject non-super_admin callers server-side (403/401) regardless of request body.
- [ ] Capture exports a live proposal into a new versioned `demo_fixtures` record with sections (content incl. placeholder ids), assumptions, RFP fields, and RFP chunks; re-capture creates a new version.
- [ ] The demo RFP is ingested through the real pipeline; run-time retrieval returns genuine RFP + regulatory citations with no run-time embedding call.
- [ ] The presenter flow runs add-RFP → extract fields → extract assumptions → standard-template select → sequential populate (delay per section, no fake streaming) with deterministic content.
- [ ] Each run mints a fresh draft proposal in the demo org owned by the caller; two concurrent runs do not collide.
- [ ] No demo-aware conditional exists below the population step; chat/rewrite/regenerate/export behave identically to a real draft.
- [ ] A template/fixture mismatch aborts run-start pre-population with a clear, section-naming error; no blank section renders.
- [ ] The reset control, in demo mode, deletes the demo proposal and all child rows and returns to pre-upload state; it refuses non-demo proposals. (Current behavior — sessionStorage.clear()+reload, zero deletes — documented above.)
- [ ] Demo proposals remain `draft`; their chunks never surface in another proposal's retrieval; abandoned demo proposals are swept on schedule; no demo-path code can set a non-draft status.
- [ ] Explicit faked-vs-real inventory (this doc) holds true against the implementation.
- [ ] All new/changed edge functions are deployed to the live project (verified, not just committed).

---

*Phase: 16-token-free-demo-mode*
*Spec created: 2026-07-20*
*Next step: lock Decisions A & B (§12), then /gsd-discuss-phase 16 for implementation decisions.*
