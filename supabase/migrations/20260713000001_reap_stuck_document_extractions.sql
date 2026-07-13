-- ============================================================
-- Reaper for documents stranded at parse_status='extracting'
-- ============================================================
-- Root cause context: extract-document sets parse_status='extracting' up front and
-- only advances at the end. A transient WORKER_RESOURCE_LIMIT isolate kill bypasses
-- JS, so neither the success path nor the catch runs, leaving the row stuck at
-- 'extracting' forever (the wizard's "all complete" gate then never fires). The
-- edge function reorder (mark usable right after the extract insert) prevents the
-- common case; this cron job is the external safety net that survives an isolate
-- kill, which is the ONLY thing that can recover such rows.
--
-- Normal extraction completes in seconds; a 15-minute floor is comfortably clear of
-- any legitimate in-flight run. If a run is somehow still live when reaped, it will
-- overwrite parse_status='complete' at its end, so a false-positive reap self-heals.

create extension if not exists pg_cron;

create or replace function public.reap_stuck_document_extractions()
returns integer
language sql
security definer
set search_path = public
as $$
  with reaped as (
    update proposal_documents d
    set parse_status = case
      -- Text was extracted before the kill -> the document is usable; mark complete.
      when exists (
        select 1 from document_extracts e
        where e.document_id = d.id and length(coalesce(e.content, '')) > 0
      ) then 'complete'
      -- Killed before any text was stored -> honest failure state.
      else 'error'
    end
    where d.parse_status = 'extracting'
      and d.created_at < now() - interval '15 minutes'
    returning 1
  )
  select count(*)::int from reaped;
$$;

revoke all on function public.reap_stuck_document_extractions() from public;
grant execute on function public.reap_stuck_document_extractions() to service_role;

-- Schedule every 5 minutes. Idempotent: drop a prior job of the same name first so
-- re-applying this migration does not error on a duplicate job name.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'reap-stuck-extractions') then
    perform cron.unschedule('reap-stuck-extractions');
  end if;
end $$;

select cron.schedule(
  'reap-stuck-extractions',
  '*/5 * * * *',
  $$select public.reap_stuck_document_extractions()$$
);
