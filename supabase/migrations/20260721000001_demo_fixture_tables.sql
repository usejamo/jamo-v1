-- Phase 16 (Plan 01): Demo-mode fixture tables — data foundation for Token-Free Demo Mode.
--
-- All 5 tables are demo-org-scoped and super_admin-only: RLS grants SELECT only to callers
-- whose private.get_user_role() = 'super_admin'; there is deliberately NO insert/update/delete
-- policy for anon/authenticated — all mutations happen via service-role edge functions
-- (demo-capture-fixture, demo-run-start, demo-reset, demo-sweep), which bypass RLS entirely.
--
-- Per SPEC Decision A, this migration adds NO demo-flag-aware cross-org bypass policy
-- anywhere — the dedicated demo org is isolated by ordinary org-scoped access alone.

-- ============================================================
-- demo_fixtures — versioned, template-bound capture of a real proposal
-- ============================================================
create table demo_fixtures (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id),
  version int not null,
  label text,
  status text check (status in ('active','archived')) default 'active',
  source_proposal_id uuid,
  rfp_fields jsonb not null,
  rfp_extract_text text,
  org_id uuid not null,
  captured_by uuid references user_profiles(id),
  created_at timestamptz default now(),
  unique(template_id, version)
);

comment on table demo_fixtures is
  'Demo-org-scoped, super_admin-only. Versioned snapshot of a real proposal used to replay a token-free demo run. One active version per template_id.';

-- One active fixture per template: activating a version is a status flip, never a recapture.
create unique index demo_fixtures_one_active_per_template
  on demo_fixtures(template_id) where status = 'active';

-- ============================================================
-- demo_fixture_sections — captured proposal_sections rows (content incl. placeholder spans)
-- ============================================================
create table demo_fixture_sections (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references demo_fixtures(id) on delete cascade,
  role text not null,
  position int not null,
  section_name text not null,
  content text not null,
  compliance_flags jsonb,
  unique(fixture_id, position)
);

comment on table demo_fixture_sections is
  'Demo-org-scoped, super_admin-only. Captured proposal_sections content (HTML incl. data-placeholder-id spans) per fixture.';

-- ============================================================
-- demo_fixture_assumptions — captured proposal_assumptions rows
-- ============================================================
create table demo_fixture_assumptions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references demo_fixtures(id) on delete cascade,
  category text,
  content text not null,
  confidence text,
  status text default 'approved',
  user_edited boolean default false
);

comment on table demo_fixture_assumptions is
  'Demo-org-scoped, super_admin-only. Captured proposal_assumptions rows for a fixture.';

-- ============================================================
-- demo_fixture_rfp_chunks — pre-computed real RFP embeddings, replayed per run
-- ============================================================
create table demo_fixture_rfp_chunks (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references demo_fixtures(id) on delete cascade,
  source text,
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb
);

comment on table demo_fixture_rfp_chunks is
  'Demo-org-scoped, super_admin-only. Pre-computed real text-embedding-3-small vectors for the demo RFP, cloned into chunks under a fresh proposal_id at run start (no model call at run time).';

-- ============================================================
-- demo_runs — tracks each demo run's proposal for concurrency isolation, reset, and sweep
-- ============================================================
create table demo_runs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  fixture_id uuid references demo_fixtures(id),
  started_by uuid references user_profiles(id),
  org_id uuid not null,
  created_at timestamptz default now()
);

comment on table demo_runs is
  'Demo-org-scoped, super_admin-only. One row per demo run; drives demo-reset targeting and the abandoned-run sweep. proposal_id cascades on delete so resetting/sweeping a run removes its proposal and all FK-cascaded children (sections, assumptions, cloned chunks, chats).';

-- ============================================================
-- RLS: super_admin-only SELECT, no client write policy on any of the 5 tables
-- ============================================================
alter table demo_fixtures            enable row level security;
alter table demo_fixture_sections    enable row level security;
alter table demo_fixture_assumptions enable row level security;
alter table demo_fixture_rfp_chunks  enable row level security;
alter table demo_runs                enable row level security;

create policy "demo_fixtures_super_admin_select" on demo_fixtures
  for select to authenticated
  using (private.get_user_role() = 'super_admin');

create policy "demo_fixture_sections_super_admin_select" on demo_fixture_sections
  for select to authenticated
  using (private.get_user_role() = 'super_admin');

create policy "demo_fixture_assumptions_super_admin_select" on demo_fixture_assumptions
  for select to authenticated
  using (private.get_user_role() = 'super_admin');

create policy "demo_fixture_rfp_chunks_super_admin_select" on demo_fixture_rfp_chunks
  for select to authenticated
  using (private.get_user_role() = 'super_admin');

create policy "demo_runs_super_admin_select" on demo_runs
  for select to authenticated
  using (private.get_user_role() = 'super_admin');
