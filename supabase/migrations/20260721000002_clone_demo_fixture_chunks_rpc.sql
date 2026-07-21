-- Phase 16 (Plan 01): clone_demo_fixture_chunks — replays a fixture's pre-computed RFP
-- embeddings into chunks under a fresh proposal_id, at run start, with zero model calls.
--
-- Pure INSERT ... SELECT row copy (Decision C). The column list is deliberately exactly
-- org_id, doc_type, proposal_id, source, content, embedding, metadata:
--   - the trigger-maintained full-text column is NOT included — a BEFORE INSERT/UPDATE
--     trigger on chunks auto-recomputes it on insert; hand-copying it would be wrong or redundant.
--   - id/created_at are NOT included — both default.
-- No model provider call anywhere: the vectors already exist in demo_fixture_rfp_chunks.

create or replace function public.clone_demo_fixture_chunks(
  p_fixture_id uuid,
  p_proposal_id uuid,
  p_org_id uuid
) returns integer
language sql security definer set search_path = public
as $$
  with inserted as (
    insert into chunks (org_id, doc_type, proposal_id, source, content, embedding, metadata)
    select p_org_id, 'proposal', p_proposal_id, source, content, embedding, metadata
    from demo_fixture_rfp_chunks
    where fixture_id = p_fixture_id
    returning 1
  )
  select count(*)::int from inserted;
$$;

comment on function public.clone_demo_fixture_chunks(uuid, uuid, uuid) is
  'Clones a demo fixture''s pre-computed RFP chunks (content + embeddings) into chunks under a fresh proposal_id, at demo run start. Pure INSERT...SELECT, no model call. service_role-only.';

revoke all on function public.clone_demo_fixture_chunks(uuid,uuid,uuid) from public;
grant execute on function public.clone_demo_fixture_chunks(uuid,uuid,uuid) to service_role;
