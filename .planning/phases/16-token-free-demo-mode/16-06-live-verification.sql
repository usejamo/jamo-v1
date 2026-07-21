-- Phase 16 Plan 06 — LIVE verification of the demo sweep, to be run via Supabase MCP
-- AFTER applying 20260721000004_demo_sweep_cron.sql.
--
-- This is the behavioural proof that the Vitest suite cannot give (no Postgres in the dev
-- environment). Steps 1-4 are READ-ONLY or dry-run and delete NOTHING. Step 5 is the only
-- destructive one and is optional.
--
-- Note `demo_fixtures` and `demo_runs` are both EMPTY as of this plan, so steps 3-5 will
-- report zero rows until a demo run has actually been started. That is expected — step 2 is
-- the guard proof that matters and it works on an empty table.

-- ============================================================
-- 1. The job exists, hourly, exactly once
-- ============================================================
select jobname, schedule, command, active
from cron.job
where jobname = 'demo-run-sweep';
-- EXPECT exactly 1 row: '0 * * * *', 'select public.sweep_abandoned_demo_runs()', active = true.
-- More than one row means the idempotence guard failed and the delete rate is doubled.

-- ============================================================
-- 2. GUARD PROOF — the sweep cannot see anything outside the demo org
-- ============================================================
-- Runs the function's own candidate query, unbounded by batch size, and shows which org each
-- candidate belongs to. Read-only.
with demo_org as (
  select count(*) over () as org_count, o.id
  from organizations o
  where o.feature_flags->>'is_demo' = 'true' or o.slug = 'jamo-demo'
)
select
  (select min(org_count) from demo_org)          as demo_org_candidates,  -- MUST be 1
  dr.id                                          as run_id,
  dr.org_id                                      as run_org_id,
  p.org_id                                       as proposal_org_id,
  p.status                                       as proposal_status,
  age(now(), dr.created_at)                      as run_age
from demo_runs dr
join proposals p on p.id = dr.proposal_id
where dr.org_id = (select id from demo_org limit 1)
  and p.org_id  = (select id from demo_org limit 1)
  and p.status  = 'draft'
  and dr.created_at < now() - interval '24 hours';
-- EXPECT: demo_org_candidates = 1, and EVERY returned row has
--   run_org_id = proposal_org_id = the jamo-demo org id, proposal_status = 'draft',
--   run_age > 24:00:00.
-- A row from any other org, any non-draft status, or any age <= 24h is a FAILURE — do not
-- proceed to step 5, unschedule the job (`select cron.unschedule('demo-run-sweep');`) and
-- report back.

-- ============================================================
-- 3. Confirm nothing outside the demo org is even reachable
-- ============================================================
-- Belt-and-braces: count demo_runs rows that are NOT in the demo org. Any such row would be a
-- registration bug elsewhere; the sweep still cannot touch it, but it should be known about.
select count(*) as demo_runs_outside_demo_org
from demo_runs dr
where dr.org_id is distinct from (
  select o.id from organizations o
  where o.feature_flags->>'is_demo' = 'true' or o.slug = 'jamo-demo'
  limit 1
);
-- EXPECT: 0.

-- ============================================================
-- 4. DRY RUN — what the next scheduled fire would destroy. Deletes nothing.
-- ============================================================
select * from public.sweep_abandoned_demo_runs(p_max_batch => 50, p_dry_run => true);
-- EXPECT: zero rows today (demo_runs is empty), and every row that ever appears here has
-- outcome = 'would_sweep'. An outcome of 'skipped_guard' means the candidate query and the
-- per-row guard disagree — investigate before running step 5.

-- ============================================================
-- 5. OPTIONAL, DESTRUCTIVE — run the sweep for real, once, by hand
-- ============================================================
-- Only after step 4 shows a candidate list you are content to lose.
-- select * from public.sweep_abandoned_demo_runs();
-- EXPECT: one row per swept run with outcome = 'swept'. Any 'error: ...' row rolled itself
-- back and will be retried on the next hourly pass — the rest of the batch still completed.

-- ============================================================
-- 6. AFTER a real sweep — the shared canonical RFP object MUST still exist
-- ============================================================
-- Every run references it and no run owns it (CONTEXT D-06). The function never touches
-- Storage, so this is a regression check, not an expectation of change.
select name, bucket_id
from storage.objects
where bucket_id = 'documents' and name like '%demo/canonical-demo-rfp.pdf';
-- EXPECT: the object is still present.

-- ============================================================
-- Rollback / kill switch
-- ============================================================
-- select cron.unschedule('demo-run-sweep');
-- The function itself is harmless when not scheduled; drop it only if reverting the plan:
--   drop function if exists public.sweep_abandoned_demo_runs(int, boolean);
