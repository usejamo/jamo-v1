# Phase 16: Token-Free Demo Mode - Research

**Researched:** 2026-07-21
**Domain:** Supabase edge functions (Deno) + Postgres/pgvector clone-per-run replay + React wizard reuse + pg_cron/pg_net scheduled sweep
**Confidence:** HIGH (schema/code-level claims — all directly read from this repo) / MEDIUM (pg_cron+pg_net scheduled-Edge-Function pattern — verified via official Supabase docs search, not yet used in this repo)

## Summary

Phase 16 is additive and highly constrained: 5 new tables, 3-4 new edge functions, one scheduled sweep, and a thin "demo driver" layered above the existing wizard — with an explicit prohibition on touching `generate-proposal-section`, `retrieve-context`, chat, rewrite, regenerate, or export. Every access-control, clone, and cleanup mechanism this phase needs already has a directly analogous, shipped pattern elsewhere in this codebase: the `getAuthedUserAndOrg` + `admin-create-org` 403 gate (Phase 15), the idempotent invite-based bootstrap script (`scripts/bootstrap-super-admin.ts`), a live `pg_cron` reaper job (`20260713000001_reap_stuck_document_extractions.sql`), and a `private.*` Vault-wrapper-function convention (`20260506000026_salesforce_integration.sql`) for anything that needs a secret inside SQL. The one genuinely new mechanical piece is invoking an edge function *from* `pg_cron` (via `pg_net`'s `net.http_post`) — this repo has never done that; `pg_cron`'s existing jobs are pure-SQL. That pattern is well-documented by Supabase (verified via web search, not Context7 — no Context7 MCP tool was available in this environment) and composes cleanly with the existing Vault-wrapper convention.

The clone-per-run mechanism (Decision C) is confirmed at the exact column level: `chunks` has a direct `proposal_id` FK `ON DELETE CASCADE` (`20260710000001`), `search_vector` is trigger-maintained (`BEFORE INSERT` trigger, `20260320000015_chunks_table.sql:23-26`) so it must NOT be hand-copied, and neither proposal-retrieval RPC joins `proposal_documents`/`document_extracts` — so a pure `INSERT ... SELECT` of `chunks` rows (org_id, doc_type, source, content, embedding, metadata, proposal_id) is sufficient and safe. The one FK that does **not** cascade is `proposal_documents.proposal_id` (`ON DELETE SET NULL`, `20260305000006_proposal_documents.sql:4`) — confirming the SPEC's orphan caveat is real and must be handled by explicit delete in both `demo-reset` and the sweep.

**Primary recommendation:** Mirror the Phase 15 provisioning patterns verbatim (JWT-gate via `getAuthedUserAndOrg` + service-role re-check of `user_profiles.role`, idempotent invite-based seed script) for every new demo edge function; use a plain `INSERT ... SELECT` RPC (SQL function, `SECURITY DEFINER`, `service_role`-only grant) for the chunk clone rather than doing it in application code, so it's one round trip and transactionally atomic with the rest of `demo-run-start`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Super_admin gate (all demo endpoints) | API / Backend (edge fn) | — | Server-side JWT + `user_profiles.role` re-check is the only trusted source; UI gating is cosmetic only (SPEC Req 1) |
| Fixture capture (`demo-capture-fixture`) | API / Backend (edge fn) | Database (5 new tables) | Snapshot write is a privileged, versioned, service-role-only operation |
| Chunk clone (Decision C) | Database (Postgres RPC) | API / Backend (edge fn calls it) | Pure `INSERT...SELECT` belongs in SQL, not app code — avoids a round trip per row and keeps it transactional with the rest of `demo-run-start` |
| Demo run start (`demo-run-start`) | API / Backend (edge fn) | Database | Multi-table atomic write (proposal + sections + assumptions + doc row + chunks + demo_runs) — must be one transaction, mirrors the existing pattern of edge fns doing multi-row service-role writes |
| Presenter run surface (wizard reuse) | Browser / Client | Frontend Server (n/a — SPA) | D-01 reuses `ProposalCreationWizard` + Step2/3/4 client components unchanged in shape; a thin "demo driver" swaps data source |
| Per-section paced reveal | Browser / Client | — | D-03: cosmetic delay + reuse of `useProposalGeneration`'s existing Realtime/reducer plumbing — no new backend mechanism |
| Reset (`demo-reset`) | API / Backend (edge fn) | Database | Run-scoped, caller-verified hard delete; must be server-side to enforce the demo-org/draft/ownership triple-guard (D-10) |
| Scheduled sweep | Database (pg_cron trigger) | API / Backend (edge fn body) | `pg_cron`+`pg_net` fires the HTTP call; the actual cleanup logic (incl. Storage-adjacent deletes) must live in an edge function because pg_cron/SQL alone cannot delete Storage objects |
| Post-generation chat/rewrite/regenerate/export | API / Backend + Browser (existing) | — | Explicitly OUT of scope — SPEC requires zero demo-aware conditionals here; tier ownership is whatever it already is today |

## Standard Stack

### Core (all already in use in this repo — no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `supabase-js` (Deno import `supabase`) | pinned via import map, matches other edge fns | Service-role + user client construction | Every edge fn in this repo uses the same two-client pattern (`_shared/auth.ts`) |
| Postgres `pgvector` (`extensions.vector(1536)`) | already installed | Storage + clone of RFP embeddings | `chunks.embedding` column type; clone must preserve this exact type/dims |
| `pg_cron` | already enabled (`20260713000001`) | Schedule the sweep trigger | Already used for the stuck-extraction reaper — same convention |
| `pg_net` | **NOT yet enabled in this repo** — verify via `select * from pg_available_extensions where name='pg_net'` and `create extension if not exists pg_net;` | HTTP call from SQL cron job to the sweep edge function | Standard Supabase-recommended pairing for cron→edge-function invocation [CITED: supabase.com/docs/guides/functions/schedule-functions] |
| Supabase Vault (`vault.create_secret` / `vault.decrypted_secrets`) | already in use (`private.vault_*` wrapper functions, `20260506000026`) | Store the service-role bearer token (or a dedicated sweep secret) referenced by the cron job's `net.http_post` call, so the key never appears in migration SQL literally | Same `private.*` SECURITY DEFINER + `REVOKE ALL FROM PUBLIC` + `GRANT TO service_role` convention already established for Salesforce OAuth tokens |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | — | — | This phase is deliberately additive-only within the existing stack (React/Vite, Supabase Edge Functions/Deno, Postgres, Anthropic, OpenAI embeddings) — SPEC explicitly forbids new demo-only generation/retrieval logic |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg_cron` + `pg_net` scheduled edge function | Supabase's newer "Cron" dashboard product (wraps pg_cron+pg_net, same underlying mechanism, added via dashboard/API rather than hand-written SQL) [CITED: supabase.com/blog/supabase-cron] | Functionally identical; this repo's convention is committed-migration-first (`supabase/migrations/*.sql`), so hand-written `cron.schedule` + `net.http_post` in a migration matches existing style (the reaper job) rather than an out-of-band dashboard config |
| Application-code chunk clone (fetch all rows, re-insert via supabase-js) | Server-side SQL RPC doing `INSERT INTO chunks (...) SELECT ... FROM demo_fixture_rfp_chunks WHERE fixture_id = $1` | SQL RPC is atomic, avoids marshaling `vector(1536)` arrays through JS, and is explicitly what Decision C's "pure INSERT...SELECT" language calls for |
| Separate `demo-validate-fixture` edge function only | Validation inline inside `demo-run-start` (shared routine, called from both) | SPEC/CONTEXT leave this to planner discretion (open in CONTEXT.md) — see Open Questions below; recommend a shared pure function imported by both surfaces so there is one source of truth for "what does a valid fixture look like" |

**Installation:** None — no new npm/Deno dependencies. Only new Postgres extension: `pg_net` (verify availability, then `create extension if not exists pg_net;` in a migration, mirroring the `pg_cron` enable-pattern already in `20260713000001_reap_stuck_document_extractions.sql:16`).

**Version verification:** N/A — no new package versions to pin. `pg_net` and `pg_cron` are Supabase-hosted-platform extensions (version managed by Supabase, not by this repo); confirm via `select extversion from pg_extension where extname in ('pg_cron','pg_net');` after enabling.

## Architecture Patterns

### System Architecture Diagram

```
PRESENTER (super_admin, demo-org account)
  │
  ▼
[Wizard Step 1] "Add demo RFP" (demo driver skips real upload UI,
   shows the fixture's stored filename as if just uploaded)
  │
  ▼
demo-run-start (edge fn, JWT+role gate) ──┐
  │  1. re-check super_admin from user_profiles       │  Validation Architecture:
  │  2. load ACTIVE demo_fixtures row for the          │  fixture vs current
  │     standard template_id (Req 7 gate HERE)         │  template_sections
  │  3. TRANSACTION:                                   │  (roles/positions match)
  │     - INSERT proposals (demo org, draft, caller)   │
  │     - INSERT proposal_sections (from template_sections
  │       + demo_fixture_sections content)
  │     - INSERT proposal_assumptions (from demo_fixture_assumptions)
  │     - INSERT proposal_documents (org+proposal_id, storage_path =
  │       shared canonical object) + document_extracts (rfp_extract_text)
  │     - RPC: clone_demo_fixture_chunks(fixture_id, new_proposal_id, org_id)
  │       → INSERT ... SELECT INTO chunks (search_vector auto-computed)
  │     - INSERT demo_runs (proposal_id, fixture_id, started_by, org_id)
  │  4. return { proposal_id, demo_run_id }
  ▼
[Wizard Step 2] Document-extraction step — reads proposal_documents
   (already 'complete' — no polling wait, D-06)
  │
  ▼
[Wizard Step 3] Assumption review — reads proposal_assumptions
   (already populated — no extract-assumptions call)
  │
  ▼
[Wizard Step 4] Template pre-selected + locked (D-02) → "Generate"
  │
  ▼
DEMO DRIVER (frontend only) reuses useProposalGeneration's realtime/
  reducer plumbing: dispatches SECTION_COMPLETE per section with a
  FIXED DELAY, sourcing content from the already-written
  proposal_sections rows (server wrote them atomically in step above) —
  NO call to generate-proposal-section, NO token streaming (D-03)
  │
  ▼
═══════════ POPULATION STEP BOUNDARY — NO DEMO CODE BELOW HERE ═══════════
  │
  ▼
Real chat / rewrite / regenerate / export — UNMODIFIED production code,
  live Anthropic calls, live retrieve-context (RFP-own chunks via
  c.proposal_id = current_proposal_id branch + global regulatory tier)
  │
  ▼
demo-reset (edge fn, JWT+role gate, input: demo_run_id)
  1. load demo_runs row by id; assert org=demo org, proposal.status='draft'
  2. DELETE proposals row → cascades sections/assumptions/chunks/chats/
     chat_sessions/section_versions
  3. EXPLICIT DELETE proposal_documents (+ cascaded document_extracts) —
     NOT covered by proposal cascade (SET NULL, not CASCADE)
  4. DELETE demo_runs row
  5. Storage object is NOT deleted (shared canonical file, D-06)
  → client returns to "Add demo RFP" start, in-session, no reload (D-11)

SWEEP (pg_cron → net.http_post → demo-sweep edge fn, hourly)
  Same cleanup as demo-reset, applied to every demo_runs row whose
  proposals.created_at (or demo_runs.created_at) < now() - 24h,
  proposal still 'draft'. Runs as edge fn (not pure SQL) because Storage
  cleanup requires the Storage API — but per D-06 there is nothing to
  delete in Storage (shared canonical file), so the sweep's Storage step
  is a no-op today; keep it as an edge fn anyway for future-proofing and
  parity with demo-reset's code path (avoid two divergent cleanup
  implementations).
```

### Recommended Project Structure
```
supabase/
├── functions/
│   ├── demo-capture-fixture/index.ts      # NEW — mirrors admin-create-org's gate shape
│   ├── demo-run-start/index.ts            # NEW
│   ├── demo-reset/index.ts                # NEW
│   ├── demo-sweep/index.ts                # NEW — invoked by pg_cron, not by a user JWT
│   ├── demo-validate-fixture/index.ts     # NEW (optional per CONTEXT discretion) or a shared _shared/demoFixtureValidation.ts imported by both demo-run-start and this
│   └── _shared/auth.ts                    # REUSE unchanged — getAuthedUserAndOrg, isInternalServiceRoleCall
├── migrations/
│   ├── <ts>_demo_fixture_tables.sql        # 5 new tables + RLS (super_admin-only)
│   ├── <ts>_clone_demo_fixture_chunks_rpc.sql  # SQL function, SECURITY DEFINER, service_role grant
│   ├── <ts>_demo_org_seed.sql OR scripts/seed-demo-org.ts  # D-08 — mirror bootstrap-super-admin.ts
│   └── <ts>_demo_sweep_cron.sql            # pg_net enable + cron.schedule + vault secret wiring
scripts/
└── seed-demo-org.ts                        # NEW (if D-08 seed is a script, not a migration — mirrors bootstrap-super-admin.ts's idempotency-guard/upsert/invite pattern)
src/
├── components/
│   ├── ProposalCreationWizard.tsx          # UNCHANGED shape; demo driver wraps/feeds it (D-01)
│   ├── wizard/Step2DocumentUpload.tsx      # UNCHANGED — already DB-backed/polling; demo path just has data pre-populated
│   ├── wizard/Step4Generate.tsx            # small addition: pre-select+lock standard template when in demo mode (D-02)
│   └── Sidebar.tsx                         # DELETE the vestigial "Reset Demo" button + "jamo Demo v0.1.0" label (D-09)
```

### Pattern 1: Server-side super_admin gate (copy verbatim)
**What:** Every demo edge fn calls `getAuthedUserAndOrg(req, corsHeaders)`, then re-reads `role` from `user_profiles` by the verified `userId`, 403s if not `super_admin`.
**When to use:** Every one of `demo-capture-fixture`, `demo-run-start`, `demo-reset`, `demo-validate-fixture`. NOT `demo-sweep` (see Pattern 4 — that one is triggered by `pg_net`, not a user JWT).
**Example:**
```typescript
// Source: supabase/functions/admin-create-org/index.ts:30-53 (this repo, Phase 15)
let userId: string
try {
  ({ userId } = await getAuthedUserAndOrg(req, corsHeaders))
} catch (e) {
  if (e instanceof Response) return e
  throw e
}
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const { data: callerProfile } = await admin
  .from('user_profiles').select('role').eq('user_id', userId).single()
if (callerProfile?.role !== 'super_admin') {
  return jsonError(403, 'super_admin required', corsHeaders)
}
```

### Pattern 2: Idempotent seed script (D-08 demo org + presenter account)
**What:** Mirror `scripts/bootstrap-super-admin.ts` exactly: idempotency guard → upsert org (`onConflict: 'slug'`) with `feature_flags: {"is_demo": true}` → insert PENDING `invites` row → `auth.admin.createUser` → flip invite to `accepted`.
**When to use:** D-08's "committed, idempotent seed... Not hand-created via the admin panel."
**Example:**
```typescript
// Source: scripts/bootstrap-super-admin.ts:56-106 (this repo, Phase 15) — same shape, different org/role:
// DEMO_ORG = { name: 'Jamo Demo', slug: 'jamo-demo', plan: 'internal' } (or similar), feature_flags: { is_demo: true }
// role: 'super_admin' (per D-07, presenter needs cross-org list visibility + demo gate pass)
// The existing script's 5-step sequence (idempotency guard, org upsert, pending invite,
// createUser, flip-to-accepted) is directly reusable with different constants — recommend
// either parameterizing bootstrap-super-admin.ts to accept an org/role argument, or a
// sibling script `seed-demo-org.ts` that imports/duplicates the same sequence.
```
**Caveat:** `organizations.feature_flags` merge — use a real JSON merge or ensure the upsert doesn't clobber other flags if the demo org row is re-seeded later; since this is a fresh dedicated org (Decision A), there should be no pre-existing flags to clobber, but write the upsert as `feature_flags: { is_demo: true }` explicitly rather than relying on a default.

### Pattern 3: Clone-per-run chunk copy (Decision C) — SQL RPC, not app code
**What:** A `SECURITY DEFINER` SQL function that does a pure `INSERT ... SELECT` from `demo_fixture_rfp_chunks` into `chunks`, supplying the new `proposal_id` and `org_id`. `search_vector` must NOT be in the column list (trigger computes it, `20260320000015:23-26`); `id`/`created_at` default.
**When to use:** Inside `demo-run-start`'s transaction, right after inserting the new `proposals` row.
**Example (research-derived, not yet in repo):**
```sql
-- Source: pattern derived from supabase/migrations/20260320000015_chunks_table.sql (search_vector
-- trigger) + 20260710000001_chunks_proposal_scope_columns.sql (proposal_id FK CASCADE) +
-- Decision C's explicit "pure INSERT...SELECT row copy — no embedding/model call" requirement.
CREATE OR REPLACE FUNCTION public.clone_demo_fixture_chunks(
  p_fixture_id uuid,
  p_proposal_id uuid,
  p_org_id uuid
) RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  WITH inserted AS (
    INSERT INTO chunks (org_id, doc_type, proposal_id, source, content, embedding, metadata)
    SELECT p_org_id, 'proposal', p_proposal_id, source, content, embedding, metadata
    FROM demo_fixture_rfp_chunks
    WHERE fixture_id = p_fixture_id
    RETURNING 1
  )
  SELECT count(*)::int FROM inserted;
$$;
REVOKE ALL ON FUNCTION public.clone_demo_fixture_chunks FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_demo_fixture_chunks TO service_role;
```

### Pattern 4: Scheduled edge function via pg_cron + pg_net (Req 9 sweep)
**What:** `pg_cron` fires a SQL job on schedule; the job body is `select net.http_post(url := ..., headers := ..., body := ...)` targeting the deployed `demo-sweep` edge function URL, with the service-role key (or a dedicated internal secret) in the Authorization header so the edge function's `isInternalServiceRoleCall(req)` check (already in `_shared/auth.ts:14-17`) passes without needing a user JWT.
**When to use:** SPEC Req 9 — "should be a scheduled edge function... not a pure pg_cron SQL job."
**Example:**
```sql
-- Source: pattern from supabase.com/docs/guides/functions/schedule-functions [CITED — verified
-- via web search, official Supabase docs; WebFetch of the page itself was blocked in this
-- environment's tool routing, so treat exact syntax as MEDIUM confidence pending a live check]
-- + this repo's existing Vault-wrapper convention (20260506000026_salesforce_integration.sql)
-- + existing pg_cron enable-pattern (20260713000001).

create extension if not exists pg_net;

-- Store the service-role key once via a private.* wrapper (mirrors vault_store_sf_tokens),
-- OR reference an existing secret if the project already vaults one for cron use.
select cron.schedule(
  'demo-run-sweep',
  '0 * * * *',  -- hourly
  $$
  select net.http_post(
    url := 'https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/demo-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'demo_sweep_service_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
```
**Note:** Confirm the exact `net.http_post` column/argument names (`url`, `headers`, `body` vs `params`) against the live project's `pg_net` version before finalizing the migration — this repo has never used `pg_net`, so there is no in-repo precedent to copy verbatim (unlike every other pattern in this research).

### Anti-Patterns to Avoid
- **Hand-copying `search_vector` in the chunk clone:** it's a `BEFORE INSERT/UPDATE` trigger column (`tsvector_update_trigger`) — including it in the INSERT column list either errors or produces a stale value if the trigger doesn't fire on that exact column set. Leave it out of both the column list and the SELECT.
- **Resolving "the current demo run" from the account instead of a passed `demo_run_id`:** D-07's shared login makes any account-scoped "current run" lookup ambiguous under concurrent presenters (D-10 explicitly rejects this).
- **Building the sweep as a pure SQL `cron.schedule` body (like the existing reaper):** SPEC Req 9 explicitly calls this out — a pure SQL job cannot call the Storage API, so it would leave orphaned Storage objects on any future path where a demo run does own non-shared Storage content. Even though today's design (D-06) means there's nothing to delete, keep the sweep as an edge fn for cohesion with `demo-reset`'s logic (one implementation, not two).
- **New RLS bypass policy for the demo org:** Decision A is specifically designed to need **zero** new cross-org policy surface — do not add an `is_demo`-aware bypass anywhere; the dedicated org + existing org-scoped RLS already isolates it.
- **Demo branch inside `generate-proposal-section`/`retrieve-context`/chat/rewrite/export:** explicitly forbidden (SPEC Req 6, "no demo-aware conditional below the population step"). All demo-specific logic must live in the new edge functions + the wizard-level "demo driver," never inside the shared generation/retrieval/chat code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Super_admin identity verification | A new JWT-parsing/role-check helper | `getAuthedUserAndOrg` + inline `user_profiles.role` re-check (copy `admin-create-org` pattern) | Already hardened against body-supplied identity (Phase 14.3); reinventing risks reintroducing a trust-the-body bug |
| Idempotent org+account bootstrap | A bespoke demo-seed script from scratch | Adapt `scripts/bootstrap-super-admin.ts`'s exact 5-step sequence | It already handles the invite-trigger race correctly (pending-then-accepted ordering, T-15-27) — a new implementation risks re-introducing that exact bug |
| Embedding regeneration for the demo RFP at run time | Any live OpenAI embedding call in `demo-run-start` | Clone pre-computed `demo_fixture_rfp_chunks.embedding` via `INSERT...SELECT` | This is the entire point of Decision C — near-zero latency + zero token cost |
| tsvector maintenance on cloned chunks | Manually computing/copying `search_vector` | Let the existing `chunks_search_vector_update` trigger fire on INSERT | Trigger already exists and is the single source of truth; duplicate logic will drift |
| Cron→Edge-Function auth | A new bespoke webhook secret scheme | Supabase Vault (`vault.create_secret`/`decrypted_secrets`) wrapped in a `private.*` SECURITY DEFINER function, mirroring `private.vault_*` from `20260506000026` | Same trust boundary as the already-shipped Salesforce token storage — reviewers already understand this pattern |

**Key insight:** Nearly every mechanism this phase needs is a small variation on a pattern already shipped and reviewed in Phases 14.3/14.5/14.7/15/12. The only genuinely novel piece is `pg_net`-based cron→edge-function invocation, which should be scoped as its own small, carefully-tested task since it's unprecedented in this repo.

## Common Pitfalls

### Pitfall 1: Forgetting the `proposal_documents` orphan on reset/sweep
**What goes wrong:** Deleting the `proposals` row does NOT clean up its `proposal_documents` row (FK is `ON DELETE SET NULL`, not CASCADE — `20260305000006:4`) or the `document_extracts` row that cascades from it.
**Why it happens:** Every other per-run table (`proposal_sections`, `proposal_assumptions`, `chunks`, `proposal_chats`, `chat_sessions`, `proposal_section_versions`) DOES cascade from `proposals`, so it's easy to assume this one does too.
**How to avoid:** `demo-reset` and `demo-sweep` must both explicitly `DELETE FROM proposal_documents WHERE proposal_id = ...` (or `WHERE id = <the run's materialized doc row id>`, captured on `demo_runs` or looked up) BEFORE/independent of deleting `proposals`.
**Warning signs:** After a reset, `select count(*) from proposal_documents where proposal_id is null and org_id = <demo org>` grows unboundedly.

### Pitfall 2: Including `search_vector` in the chunk-clone INSERT
**What goes wrong:** `chunks.search_vector` is populated by a `BEFORE INSERT OR UPDATE` trigger (`tsvector_update_trigger(search_vector, 'pg_catalog.english', content, source)`). Explicitly inserting a value for it either conflicts with or is silently overwritten by the trigger — but including it invites confusion/drift if someone later "optimizes" the RPC to skip the trigger.
**Why it happens:** Copy-paste from a naive "copy every column" instinct.
**How to avoid:** The clone RPC's column list must be exactly: `org_id, doc_type, proposal_id, source, content, embedding, metadata` — never `search_vector`, never `id`/`created_at` (both default).
**Warning signs:** FTS retrieval (`match_chunks_fts_proposals`) on cloned chunks returns nothing even though vector retrieval works.

### Pitfall 3: `pg_net` not enabled / edge function URL wrong environment
**What goes wrong:** `net.http_post` silently fails or the migration errors if `pg_net` isn't enabled first; a hardcoded local/staging function URL in a committed migration would call the wrong environment.
**Why it happens:** This repo has never used `pg_net` before — no existing migration to copy the enable-step from (unlike `pg_cron`, which the reaper migration already demonstrates).
**How to avoid:** `create extension if not exists pg_net;` at the top of the sweep migration (same idempotent-enable pattern as `20260713000001:16`'s `pg_cron`); use the project's actual hosted URL (`https://fuuvdcvbliijffogjnwg.supabase.co/functions/v1/demo-sweep`, matching the constraint's project ref) since migrations apply only to the one hosted project (no local/prod divergence to worry about per this repo's Supabase-hosted-only constraint).
**Warning signs:** `select * from net._http_response order by created desc limit 5;` (pg_net's response log table) shows failed/absent rows after the cron fires.

### Pitfall 4: Fixture validation runs too late or not at all
**What goes wrong:** If validation only happens as a side effect of the populate loop trying (and failing) to find a fixture section for a given `template_sections` role, the failure surfaces mid-demo as a blank section — exactly what SPEC Req 7 forbids ("Never render a blank section mid-demo").
**Why it happens:** It's tempting to just let a missing fixture-section row silently produce `content: ''` at run-start time rather than pre-flighting the whole set.
**How to avoid:** Before any writes in `demo-run-start`, fetch `template_sections` for the standard template and the active fixture's `demo_fixture_sections`, diff by `(role, position)`, and abort with a named-section error if any template role is missing from the fixture (or vice versa) — this is the shared validation routine CONTEXT.md leaves as an open discretion point (see Open Questions).
**Warning signs:** A demo run completes but one section card is empty/pending forever.

### Pitfall 5: Confusing "own-proposal chunks" retrieval with confidentiality bypass
**What goes wrong:** Assuming the demo's cloned chunks need any special-casing in `retrieve-context` because they're "demo data."
**Why it happens:** The temptation to add an `is_demo` branch anywhere retrieval touches org/proposal scoping.
**How to avoid:** They don't need special-casing — the existing own-proposal branch (`c.proposal_id = current_proposal_id`, matches ANY status including draft) already returns them because `demo-run-start` sets the correct `proposal_id` on the cloned rows. This is exactly why Decision C requires per-run cloning under a fresh `proposal_id` rather than a shared reference proposal.
**Warning signs:** Any code review finding an `is_demo`/`feature_flags` check inside `retrieve-context`, `generate-proposal-section`, or the RPCs — this should never exist per SPEC Req 6.

## Code Examples

### Super_admin gate check (verbatim reusable pattern)
```typescript
// Source: supabase/functions/admin-create-org/index.ts:30-53 (this repo)
try {
  ({ userId } = await getAuthedUserAndOrg(req, corsHeaders))
} catch (e) {
  if (e instanceof Response) return e
  throw e
}
const { data: callerProfile } = await admin.from('user_profiles').select('role').eq('user_id', userId).single()
if (callerProfile?.role !== 'super_admin') return jsonError(403, 'super_admin required', corsHeaders)
```

### Fixture-vs-template validation shape (Req 7)
```typescript
// Derived pattern — no direct precedent in repo, composed from template_sections schema
// (20260418000023_templates.sql:26-35) + demo_fixture_sections schema (16-SPEC.md §Schema).
async function validateFixtureAgainstTemplate(admin, templateId: string, fixtureId: string) {
  const { data: templateSections } = await admin
    .from('template_sections').select('role, position, name').eq('template_id', templateId)
  const { data: fixtureSections } = await admin
    .from('demo_fixture_sections').select('role, position, section_name').eq('fixture_id', fixtureId)

  const fixtureByRole = new Map((fixtureSections ?? []).map(s => [s.role, s]))
  const missing = (templateSections ?? []).filter(ts => !fixtureByRole.has(ts.role))
  if (missing.length > 0) {
    throw new Error(`Fixture missing section(s) for role(s): ${missing.map(m => m.name).join(', ')}`)
  }
  // also check no extra/renamed roles, position drift, etc. per SPEC "schema must match"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual/no reset (sessionStorage.clear + reload, zero DB deletes) | `demo-reset` edge fn, run-scoped hard delete, no page reload | This phase | Presenters can actually re-run mid-call without a stale/half-deleted proposal lying around |
| No pg_net usage in this repo | `pg_cron` + `pg_net` → edge function for the sweep | This phase (new pattern for this repo) | First time a scheduled job needs to reach outside SQL (Storage API parity, even if currently a no-op) |

**Deprecated/outdated:**
- The `Sidebar.tsx:119-132` "Reset Demo" button and the `ProposalContentsSidebar.tsx:101` "jamo Demo v0.1.0" label — both vestigial from the pre-Supabase demo era, removed per D-09, replaced entirely by the new demo-run-surface-scoped reset control.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pg_net`'s `net.http_post` function signature is `net.http_post(url, headers, body, ...)` returning a request id, with responses logged to a `net._http_response` table pollable for debugging | Pattern 4 / Pitfall 3 | If the live project's `pg_net` version has different arg names/behavior, the sweep migration will need adjustment at apply time — verify against the actual installed `pg_net` version via Supabase MCP before finalizing the migration SQL |
| A2 | A `Bearer <service_role_key>` (or a dedicated Vault-stored secret) in the `net.http_post` Authorization header will satisfy `isInternalServiceRoleCall(req)` in `_shared/auth.ts` | Pattern 4 | If `demo-sweep` instead needs a different auth shape (e.g., Supabase's function-invoke JWT verification default), the sweep function may need `verify_jwt = false` configured in `supabase/config.toml` for that specific function, plus its own internal secret check |
| A3 | The demo org's presenter account role should be `super_admin` (matching D-07/Decision A's "global super_admin credential" framing) rather than a new/lesser role | Pattern 2 | If a future decision narrows this to a demo-scoped role, the seed script and every demo-endpoint gate (`role !== 'super_admin'`) would need to change together |

**If this table is empty:** N/A — see above; all three are genuine gaps in what could be verified from static code alone (pg_net has zero precedent in this repo, and no live Supabase MCP session was used to check its installed version during this research pass).

## Open Questions

1. **Where does fixture validation (Req 7) run — `demo-run-start` only, a separate `demo-validate-fixture`, or both?**
   - What we know: CONTEXT.md explicitly leaves this to planner/researcher discretion. `demo-run-start` MUST validate before writing (Pitfall 4) regardless.
   - What's unclear: Whether the capture/admin UI also wants a standalone "check this fixture" action independent of starting a run (useful right after capture, before the next demo).
   - Recommendation: Implement validation as a shared pure function (e.g. `_shared/demoFixtureValidation.ts` or duplicated per the Deno-can't-import-src/ convention) called from `demo-run-start` (blocking) and optionally exposed via a thin `demo-validate-fixture` endpoint for the capture UI to call proactively. Low cost either way since the logic is a single diff of two small row sets.

2. **Exact `net.http_post` argument shape for this project's live `pg_net` version.**
   - What we know: The general pattern (cron.schedule → net.http_post with url/headers/body) is well-documented and stable across recent Supabase pg_net versions.
   - What's unclear: This repo has zero existing usage to copy, and WebFetch of the official docs page was blocked in this research session's tool routing (context-mode intercepts WebFetch) — only WebSearch summaries were available, not the literal doc page.
   - Recommendation: Before writing the sweep migration, either use Context7/an official-docs fetch in the planning/execution session (if the tool-routing constraint is lifted there) or apply a small test migration via Supabase MCP and inspect `net._http_response` to confirm the call succeeded, before committing the final sweep job.

3. **Demo org seed: migration vs. standalone script (D-08 says "seed," Phase 15 precedent uses a `scripts/*.ts` file, not a migration).**
   - What we know: `bootstrap-super-admin.ts` is a script (`npx tsx scripts/bootstrap-super-admin.ts`), not a SQL migration, because it needs `auth.admin.createUser` (an admin-API call, not raw SQL).
   - What's unclear: Whether the demo org itself (the `organizations` row) should be seeded in that same script, or in a plain SQL migration (organizations is a plain table insert, no admin-API dependency) with only the presenter *account* going through the script.
   - Recommendation: Split it — a SQL migration upserts the demo `organizations` row (`feature_flags.is_demo = true`), and a script (parameterized variant of `bootstrap-super-admin.ts`, or a new `seed-demo-org.ts` following the identical 5-step sequence) creates the presenter super_admin account bound to that org via the same pending-invite mechanism. This matches "org via migration, account via invite-script" — the exact split already used for every other org+user pair in this codebase (Phase 15's `admin-create-org` inserts the org row directly; the user always goes through the invite/trigger path, never a raw `auth.users` insert).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pg_cron` | Sweep scheduling | Yes (already enabled, `20260713000001`) | unspecified (Supabase-managed) | — |
| `pg_net` | Sweep → edge function HTTP call | Not yet enabled in this repo (no migration references it) | unspecified — verify via Supabase MCP `select * from pg_available_extensions where name='pg_net'` before writing the migration | If unavailable on this Supabase plan (unlikely on hosted Pro/Team, per Supabase's 2026 docs), fall back to Supabase's dashboard-native "Cron" scheduling UI, which wraps the same mechanism without requiring a hand-written `pg_net` migration |
| Supabase Vault | Storing the sweep's HTTP auth secret | Yes (already in use, `20260506000026`) | project-managed | — |
| Supabase Management API / MCP (for applying migrations) | All new migrations in this phase | Yes — this project's established workflow (`supabase db push` diverged, MCP `apply_migration` is the only path) | — | None — this is a hard constraint, not optional |
| Edge function deploy (`supabase functions deploy`) | Every new/changed edge fn | Must be run explicitly post-land (this repo's `execute-phase` never deploys automatically — see memory `edge-functions-need-deploy`) | — | None — acceptance criteria explicitly require verified live deployment |

**Missing dependencies with no fallback:** None outright blocking — `pg_net` is the only genuinely unverified piece, and Supabase's own "Cron" product is a viable fallback if raw `pg_net` SQL proves awkward.

**Missing dependencies with fallback:** `pg_net` → Supabase dashboard-native Cron scheduling UI (same underlying mechanism, different authoring surface).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 (frontend/scripts) + Deno test (edge functions, `deno test <path> --allow-env --allow-net`) |
| Config file | `vitest.config.ts` (repo root); no `deno.json` test-runner config beyond each function's own `deno.json` |
| Quick run command | `npm run test:run` (Vitest, <15s per repo convention — no `--coverage`) |
| Full suite command | `npm run test:run` (same — this repo has no separate "full" suite; Deno edge-fn tests are NOT run by `test:run` and require `deno test` directly, which is **unavailable in this dev sandbox** per every prior phase's contingency note) |

**Known repo-wide contingency (Phases 14.3/15):** Deno is unavailable in this development environment, so every edge-function `test.ts` file in this repo uses **grep-based / predicate-only acceptance** (pure-logic assertions like slug-suffix generation or role-equality predicates, each wrapped in `Deno.test({ ignore: true })` for anything requiring a live network/DB) rather than true request/response integration tests. Live behavioral verification is deferred to a live-verify pass post-deploy. **Phase 16 should follow the identical contingency** for `demo-capture-fixture`, `demo-run-start`, `demo-reset`, `demo-sweep` — write the same shape of `test.ts` (pure predicates + `ignore: true` integration stubs) as `admin-create-org/test.ts`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPEC Req 1 | Non-super_admin caller gets 403 from every demo endpoint | unit (predicate) + integration (ignore:true, live-only) | `deno test supabase/functions/demo-run-start/test.ts` | ❌ Wave 0 |
| SPEC Req 2 | Capture produces a new versioned `demo_fixtures` row; re-capture is a new version, not overwrite | unit (version-increment predicate) + integration (live) | `deno test supabase/functions/demo-capture-fixture/test.ts` | ❌ Wave 0 |
| SPEC Req 3 | Cloned chunks preserve embedding/metadata shape, no run-time embed call | unit (SQL RPC column-list assertion via a Vitest test executing the migration SQL against a local/mock, OR a static grep asserting no `embeddings.create`/`OpenAI(` call appears in `demo-run-start/index.ts`) | `npm run test:run` (grep-style Vitest) | ❌ Wave 0 |
| SPEC Req 4 | Presenter flow: add-RFP → extract fields → extract assumptions → template-locked → sequential populate, no streaming | manual/UI (Vitest component test for Step4Generate's lock state; full flow is human-verify per this repo's convention for wizard E2E) | `npm run test:run` (component-level) + `checkpoint:human-verify` | ❌ Wave 0 (component) |
| SPEC Req 5 | Two concurrent runs never collide | integration (live-only, `ignore:true`) — hard to simulate concurrency in Deno-unavailable sandbox | N/A this session — live-verify | ❌ |
| SPEC Req 6 | No demo-aware conditional below population step | **static/negative grep** — `! grep -rn "is_demo\|demo_run\|feature_flags.*is_demo" supabase/functions/generate-proposal-section supabase/functions/retrieve-context supabase/functions/chat-with-jamo` | shell/CI grep (fast, deterministic, no Deno needed) | ✅ can write immediately, no Wave 0 gap |
| SPEC Req 7 | Fixture/template mismatch aborts pre-population with named-section error | unit — `validateFixtureAgainstTemplate` pure-function test (Vitest, since the diff logic can be a plain TS function importable outside Deno, per the `mapConfidence`/`parseClaudeResponse`-exported-for-testing convention used in `extract-assumptions`) | `npm run test:run` | ❌ Wave 0 |
| SPEC Req 8 | Reset deletes proposal + all child rows incl. `proposal_documents`/`document_extracts`; Storage file retained | unit (predicate: reset function's DELETE statement list matches expected table set) + integration (live) | `deno test supabase/functions/demo-reset/test.ts` | ❌ Wave 0 |
| SPEC Req 9 | Sweep catches draft demo proposals >24h old; never sets non-draft | unit (threshold-comparison predicate) + live-cron verify (`net._http_response` inspection post-deploy) | `deno test supabase/functions/demo-sweep/test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run` (Vitest, frontend/pure-logic pieces) + the relevant `deno test <fn>/test.ts` where Deno is available in the executing environment (may not be, per repo-wide contingency — falls back to code review of the grep-acceptance file)
- **Per wave merge:** Full `npm run test:run` + a manual review pass confirming no `demo`/`is_demo` string appears in any of `generate-proposal-section`, `retrieve-context`, `chat-with-jamo`, rewrite/regenerate/export code (Req 6's negative acceptance)
- **Phase gate:** Full suite green + live deploy of all new/changed edge functions + live Supabase MCP verification that the 5 new tables/RLS/RPC/cron job exist and the sweep's first scheduled run produced a logged `net._http_response` row

### Wave 0 Gaps
- [ ] `supabase/functions/demo-capture-fixture/test.ts` — covers Req 2 (version increment predicate)
- [ ] `supabase/functions/demo-run-start/test.ts` — covers Req 1, 3, 7 (gate predicate, no-embed-call grep, validation-diff predicate)
- [ ] `supabase/functions/demo-reset/test.ts` — covers Req 8 (delete-statement-set predicate)
- [ ] `supabase/functions/demo-sweep/test.ts` — covers Req 9 (threshold predicate)
- [ ] A pure, Vitest-testable `validateFixtureAgainstTemplate` module (mirrors the `extract-assumptions` export-for-testability convention) — covers Req 7 without needing Deno
- [ ] A CI-runnable negative grep script/test asserting no `is_demo`/`demo_run`/`demo_fixture` string appears in `generate-proposal-section`, `retrieve-context`, chat/rewrite/regenerate/export source — covers Req 6, can be written immediately (no new infra needed)
- [ ] Framework install: none — `pg_net` is a Postgres extension enable, not an npm/Deno package; no test-framework install needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth JWT, unchanged — demo presenter is a normal authenticated `super_admin` account (D-07) |
| V3 Session Management | yes | Standard Supabase JWT refresh, unchanged; demo run identity is `demo_run_id` (client-held, server-verified), not a session concept |
| V4 Access Control | yes | Server-side `getAuthedUserAndOrg` + `user_profiles.role==='super_admin'` re-check on every demo endpoint (Pattern 1); RLS on all 5 new tables restricts even direct-table access to super_admin; `demo-reset`'s triple-guard (super_admin + demo org + draft status + `demo_runs` row match) is the access-control-sensitive novel piece here |
| V5 Input Validation | yes | `demo_run_id`/`fixture_id`/`template_id` are all server-verified against DB state (ownership, org, status) before any delete/read — never trusted as "this must be valid because the client sent it" |
| V6 Cryptography | n/a (no new crypto) | Embeddings are cloned verbatim (not regenerated); no new secret-handling beyond reusing the existing Vault convention for the cron→edge-function auth token |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-run reset (presenter A's `demo_run_id` used to delete presenter B's run under the shared login, D-07) | Tampering / Elevation of Privilege (within the demo org, low severity but explicitly guarded by D-10) | `demo-reset` must verify the `demo_runs` row's `org_id` matches the demo org AND (since accounts are shared, D-07) that the row exists and its proposal is still `draft` — it cannot verify per-user ownership since the login is shared, so the guard is "this IS a demo run in the demo org, still draft" not "this run belongs to you" |
| Draft-status escape hatch (a demo proposal somehow flipped to `submitted`/`won`/`lost`, becoming retrieval-eligible cross-proposal within the demo org) | Information Disclosure | SPEC confirms only two code paths ever set `proposals.status` (create, and `StatusSelector`); the demo path must never call `StatusSelector` — this is a code-review-time invariant to grep for (`StatusSelector` should never appear reachable from the demo driver) |
| Unauthenticated/forged `net.http_post` call to `demo-sweep` from outside pg_cron | Spoofing | `isInternalServiceRoleCall(req)` check inside `demo-sweep` (same helper already used by `retrieve-context` for its internal caller) — reject anything not bearing the exact service-role/Vault-sourced secret |
| Fixture capture accidentally including real-client content | Information Disclosure | D-05: fixtures are captured ONLY from proposals generated inside the dedicated demo org — `demo-capture-fixture` should itself assert `source_proposal_id`'s `org_id` equals the demo org before snapshotting, as defense-in-depth beyond "presenter only generates real proposals in the demo org by convention" |

## Sources

### Primary (HIGH confidence — direct repo reads)
- `supabase/functions/_shared/auth.ts` — `getAuthedUserAndOrg`, `isInternalServiceRoleCall`, `jsonError`
- `supabase/functions/admin-create-org/index.ts` + `test.ts` — canonical super_admin gate + grep/predicate test convention
- `scripts/bootstrap-super-admin.ts` — idempotent invite-based bootstrap sequence
- `supabase/migrations/20260710000001_chunks_proposal_scope_columns.sql` — `chunks.proposal_id` FK CASCADE
- `supabase/migrations/20260320000015_chunks_table.sql` — `chunks` schema, `search_vector` trigger, HNSW index
- `supabase/migrations/20260708000002_alter_chunks_regulatory_tier.sql` — global regulatory tier (`org_id IS NULL`)
- `supabase/migrations/20260710000003_proposal_rpc_eligibility.sql` — both proposal RPCs' exact WHERE clauses, draft hard floor
- `supabase/migrations/20260305000006_proposal_documents.sql` — `proposal_id ON DELETE SET NULL` (orphan caveat confirmed)
- `supabase/migrations/20260305000002_organizations.sql` — `feature_flags jsonb` column (D-08 marker)
- `supabase/migrations/20260713000001_reap_stuck_document_extractions.sql` — existing `pg_cron` job pattern (idempotent unschedule-then-schedule)
- `supabase/migrations/20260506000026_salesforce_integration.sql` — Vault wrapper-function convention (`private.vault_*`, SECURITY DEFINER, REVOKE/GRANT)
- `supabase/migrations/20260305000012_rls_helper_functions.sql` + `20260305000013_rls_policies.sql` — `private.get_user_role()`/`get_user_org_id()`, `orgs_super_admin` bypass
- `supabase/functions/generate-proposal-section/index.ts` — `writeSectionById` write pattern
- `src/hooks/useProposalGeneration.ts` — realtime reveal + `generateAll` sequential loop to reuse for the paced fill
- `src/components/ProposalCreationWizard.tsx` — eager draft creation on step 1, section-upsert-on-generate pattern
- `src/components/wizard/Step2DocumentUpload.tsx`, `Step4Generate.tsx` — DB-backed polling + template pre-select (D-16 precedent already exists for standard-template pre-select!)
- `src/components/Sidebar.tsx` — vestigial reset button to remove (D-09)
- `supabase/functions/extract-document/index.ts` — real chunk+embed ingest the capture snapshots
- `supabase/functions/retrieve-context/index.ts` — own-proposal + regulatory retrieval branches, `isInternalServiceRoleCall` usage
- `.planning/phases/16-token-free-demo-mode/16-SPEC.md`, `16-CONTEXT.md`, `.planning/phases/15-client-onboarding-provisioning/15-SPEC.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`

### Secondary (MEDIUM confidence — WebSearch, cross-referenced against multiple results)
- `pg_cron` + `pg_net` scheduled Edge Function invocation pattern [CITED: supabase.com/docs/guides/functions/schedule-functions, supabase.com/blog/supabase-cron] — WebFetch of the docs page itself was blocked by this session's tool routing; only WebSearch result summaries were used, not the literal page content. Treat exact `net.http_post` argument names as needing live verification (Open Question 2).
- Supabase Vault (`vault.create_secret`/`vault.decrypted_secrets`) referenced by cron jobs — corroborated both by WebSearch and this repo's own already-shipped `private.vault_*` convention (high internal confidence, medium confidence on the cron-specific usage detail).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing conventions directly read from source
- Architecture: HIGH — every mechanism maps to a shipped precedent in this exact repo, except the pg_cron→pg_net→edge-function call, which is MEDIUM (documented externally, unprecedented internally)
- Pitfalls: HIGH — derived directly from schema-level FK/trigger inspection, not inference
- Validation Architecture: HIGH for the test-framework/contingency description (directly matches Phases 14.3/15's documented approach); MEDIUM for the specific new test file list (proposed, not yet written)

**Research date:** 2026-07-21
**Valid until:** 30 days (stable internal codebase; the one external dependency — pg_net syntax — should be re-verified at implementation time regardless of this window, since it was never confirmed against the live project in this session)
