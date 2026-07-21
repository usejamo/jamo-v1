-- ============================================================
-- Phase 16 (Plan 06) — scheduled sweep of ABANDONED demo runs (SPEC Req 9)
-- ============================================================
-- Deletes demo-org proposals that are still `draft` and whose `demo_runs` row is older
-- than 24h, applying the SAME teardown as `demo-reset`. Runs hourly, UNATTENDED.
--
-- ------------------------------------------------------------------------------------
-- WHY THIS IS DIRECT SQL AND NOT A pg_net CALL TO AN EDGE FUNCTION
-- ------------------------------------------------------------------------------------
-- 16-SPEC Req 9 says the sweep "should be a scheduled edge function ... not a pure
-- pg_cron SQL job (which cannot delete Storage objects and would leave orphaned files)".
-- That rationale is VOID against the teardown that actually shipped:
--
--   * A demo run uploads NOTHING. `demo-run-start` points `proposal_documents.storage_path`
--     at the ONE shared canonical object `{demoOrgId}/demo/canonical-demo-rfp.pdf`
--     (demo-run-start/index.ts:43 + :359 "nothing is uploaded per run").
--   * That object is referenced by EVERY run and owned by NO run (CONTEXT D-06), so it must
--     never be deleted. `_shared/demoRunCleanup.ts` therefore performs DB deletes only and
--     touches no bucket object — by design, for reset AND for this sweep.
--
-- There are consequently ZERO Storage objects for the sweep to remove, so the only thing an
-- edge function would have bought is the thing it cannot do here anyway. What it WOULD have
-- cost is real, and all of it lands on an unattended destructive job:
--   * `pg_net` is NOT installed on this project (available 0.19.5, installed_version null) —
--     new infrastructure for one caller.
--   * It would need a Vault-stored bearer that byte-matches whatever the platform injects as
--     `SUPABASE_SERVICE_ROLE_KEY` into the edge runtime. This project's service-role key is
--     the new `sb_secret_...` format, not a legacy JWT, so that match is NOT verifiable ahead
--     of time. A mismatch means an hourly silent 401 — a scheduled job that quietly does
--     nothing is the single hardest failure mode to notice.
--   * Four separate PostgREST round trips per run cannot be transactional, so a mid-row
--     failure leaves half-torn-down state.
--
-- Direct SQL has none of that: no new extension, no secret to provision or leak, no network
-- hop, no auth model for a machine caller, per-row atomicity, and it matches the ONE cron
-- precedent this repo already has (20260713000001_reap_stuck_document_extractions.sql).
--
-- THE COST IS REAL AND IS NOT A FOOTNOTE: the teardown now exists TWICE — here, and in
-- `supabase/functions/_shared/demoRunCleanup.ts` (used by `demo-reset`). A destructive
-- routine that drifts between two copies leaks rows silently for months. That is mitigated by
-- an executable drift detector, not by a promise: `src/lib/__tests__/demoSweepParity.test.ts`
-- parses BOTH this file and demoRunCleanup.ts and fails the build if the ordered set of
-- teardown statements stops matching. IF YOU ADD OR REORDER A STEP HERE, ADD OR REORDER IT
-- THERE TOO — the test will tell you, but only if you keep it.
--
-- ------------------------------------------------------------------------------------
-- BLAST-RADIUS DISCIPLINE (mirrors demo-reset's triple-guard, threats T-16-24/T-16-18)
-- ------------------------------------------------------------------------------------
--   * The demo org is resolved AT RUNTIME by `feature_flags->>'is_demo'` / slug `jamo-demo`.
--     NEVER a hardcoded UUID. If it does not resolve to EXACTLY ONE org, the sweep deletes
--     nothing at all (fail closed) — an ambiguous demo org on an unattended deleter is a
--     configuration error, not something to guess at.
--   * Triple-guard, re-asserted PER CANDIDATE ROW and not merely once for the batch:
--       (1) the `demo_runs` row is registered to the demo org,
--       (2) its proposal is in the demo org,
--       (3) that proposal is still `status = 'draft'`.
--   * Age bound: `demo_runs.created_at < now() - interval '24 hours'`.
--   * Batch bound: at most `p_max_batch` (default 50) runs per invocation.
--   * Per-row exception block => one bad row rolls back ITS OWN partial deletes and the sweep
--     continues; it can neither abort the batch nor leave half-torn-down state.
--   * `p_dry_run` reports exactly what WOULD be swept and deletes nothing, so the job can be
--     verified against live data without risk.
--   * This function NEVER updates `proposals.status`. Demo proposals stay `draft` forever,
--     which is what keeps their chunks structurally excluded from cross-proposal retrieval.
--
-- `usage_events.proposal_id` (ON DELETE SET NULL) is deliberately left alone — billing
-- telemetry, not per-run demo state. Same call as demoRunCleanup.ts.

create extension if not exists pg_cron;

-- ============================================================
-- The sweep
-- ============================================================
create or replace function public.sweep_abandoned_demo_runs(
  p_max_batch int default 50,
  p_dry_run boolean default false
)
returns table (swept_run_id uuid, swept_proposal_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_demo_org_id uuid;
  v_demo_org_count int;
  v_run record;
begin
  -- ---- Resolve the demo org at runtime, or do nothing ---------------------
  -- Fail closed on 0 matches (misconfigured / demo org removed) AND on >1 match (ambiguous:
  -- a second org flagged is_demo must never widen an unattended delete's blast radius).
  select count(*), min(o.id)
    into v_demo_org_count, v_demo_org_id
  from organizations o
  where o.feature_flags->>'is_demo' = 'true'
     or o.slug = 'jamo-demo';

  if v_demo_org_count <> 1 or v_demo_org_id is null then
    raise log 'sweep_abandoned_demo_runs: refusing to run, demo org resolved to % candidates',
      v_demo_org_count;
    return;
  end if;

  -- ---- Candidate selection: all four guards, ANDed, bounded ---------------
  for v_run in
    select
      dr.id            as run_id,
      dr.proposal_id   as proposal_id,
      dr.org_id        as run_org_id,
      p.org_id         as proposal_org_id,
      p.status         as proposal_status
    from demo_runs dr
    join proposals p on p.id = dr.proposal_id
    where dr.org_id = v_demo_org_id
      and p.org_id = v_demo_org_id
      and p.status = 'draft'
      and dr.created_at < now() - interval '24 hours'
    order by dr.created_at
    limit p_max_batch
  loop
    -- Per-row re-assertion of the triple guard. Redundant with the WHERE clause by design:
    -- the guard that matters is the one applied immediately before the delete, so a future
    -- edit to the query above cannot silently widen what gets destroyed.
    if v_run.run_org_id is distinct from v_demo_org_id
       or v_run.proposal_org_id is distinct from v_demo_org_id
       or v_run.proposal_status is distinct from 'draft'
    then
      swept_run_id := v_run.run_id;
      swept_proposal_id := v_run.proposal_id;
      outcome := 'skipped_guard';
      return next;
      continue;
    end if;

    if p_dry_run then
      swept_run_id := v_run.run_id;
      swept_proposal_id := v_run.proposal_id;
      outcome := 'would_sweep';
      return next;
      continue;
    end if;

    -- ---- Teardown. Order is load-bearing; keep in lockstep with -----------
    -- ---- _shared/demoRunCleanup.ts (see drift detector above). -----------
    begin
      -- 0. Clear proposal_assumptions.source_document. That FK targets proposal_documents
      --    ON DELETE NO ACTION, so a populated reference would make step 1 fail and render
      --    the run permanently unsweepable. Dormant today; this keeps step 1 unblockable.
      update proposal_assumptions
        set source_document = null
        where proposal_assumptions.proposal_id = v_run.proposal_id;

      -- 1. proposal_documents FIRST (cascades document_extracts). Its FK to proposals is
      --    ON DELETE SET NULL, so after step 2 the row is no longer joinable by proposal id
      --    and would orphan permanently along with its extracted RFP text.
      delete from proposal_documents
        where proposal_documents.proposal_id = v_run.proposal_id;

      -- 2. the proposal (cascades sections, assumptions, cloned chunks, chats,
      --    chat_sessions, section_versions, and the demo_runs row itself).
      delete from proposals
        where proposals.id = v_run.proposal_id;

      -- 3. the demo_runs row. Normally a no-op after step 2; kept so the routine stays
      --    idempotent and correct for an already-orphaned run row.
      delete from demo_runs
        where demo_runs.id = v_run.run_id;

      swept_run_id := v_run.run_id;
      swept_proposal_id := v_run.proposal_id;
      outcome := 'swept';
      return next;
    exception when others then
      -- The block's implicit subtransaction rolls back THIS row's partial deletes only.
      -- The batch continues; the row is retried on the next hourly pass.
      swept_run_id := v_run.run_id;
      swept_proposal_id := v_run.proposal_id;
      outcome := 'error: ' || replace(coalesce(sqlerrm, 'unknown'), chr(10), ' ');
      raise log 'sweep_abandoned_demo_runs: run % failed: %', v_run.run_id, sqlerrm;
      return next;
    end;
  end loop;
end;
$fn$;

comment on function public.sweep_abandoned_demo_runs(int, boolean) is
  'Phase 16 Req 9. Hourly sweep of abandoned demo runs: demo-org proposals still status=draft whose demo_runs row is older than 24h. Demo org resolved at runtime (feature_flags.is_demo / slug jamo-demo), never hardcoded; fails closed unless exactly one resolves. Triple-guard re-asserted per row, batch-bounded, per-row exception isolation. Never updates proposals.status and never touches Storage (the canonical demo RFP object is shared by every run and owned by none). Teardown order must stay in lockstep with supabase/functions/_shared/demoRunCleanup.ts — enforced by src/lib/__tests__/demoSweepParity.test.ts. Call with p_dry_run => true to preview.';

revoke all on function public.sweep_abandoned_demo_runs(int, boolean) from public;
grant execute on function public.sweep_abandoned_demo_runs(int, boolean) to service_role;

-- ============================================================
-- Schedule: hourly. Idempotent — drop any prior job of the same name first so re-applying
-- this migration cannot create a duplicate (and cannot double the delete rate).
-- To disable in a hurry:  select cron.unschedule('demo-run-sweep');
-- ============================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'demo-run-sweep') then
    perform cron.unschedule('demo-run-sweep');
  end if;
end $$;

select cron.schedule(
  'demo-run-sweep',
  '0 * * * *',
  $$select public.sweep_abandoned_demo_runs()$$
);
