-- supabase/migrations/20260528120000_append_resolved_item_rpc.sql
-- Phase 14.2.2 — atomic append + cap + timestamp-sort for chat_sessions.resolved_items.
-- Multi-tab race safety per D-27. SECURITY INVOKER so RLS on chat_sessions applies.
--
-- DELIBERATE DIVERGENCE: All other project RPCs use SECURITY DEFINER because they
-- cross RLS boundaries (cross-org reads, vault access). append_resolved_item is the
-- first SECURITY INVOKER RPC in this codebase — RLS WITH CHECK on chat_sessions
-- already enforces user_id = auth.uid(), so DEFINER would only weaken the contract.
--
-- Existing call sites that read this column:
--   - supabase/functions/analyze-proposal-gaps/index.ts (added in Plan 05)
-- Existing call sites that write this column:
--   - src/chat/resolved-items.ts (added in Plan 02)

create or replace function public.append_resolved_item(
  p_proposal_id uuid,
  p_user_id     uuid,
  p_org_id      uuid,
  p_entry       jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing jsonb;
  v_combined jsonb;
  v_capped   jsonb;
  v_cap      int := 25;
begin
  -- Step 1: lock row under FOR UPDATE.
  select resolved_items into v_existing
  from chat_sessions
  where proposal_id = p_proposal_id and user_id = p_user_id
  for update;

  if not found then
    -- Step 1b: upsert if row missing (D-28).
    insert into chat_sessions (proposal_id, user_id, org_id, resolved_items)
    values (p_proposal_id, p_user_id, p_org_id, jsonb_build_array(p_entry))
    on conflict (proposal_id, user_id) do nothing;

    -- Re-fetch under lock to handle the concurrent-insert race.
    select resolved_items into v_existing
    from chat_sessions
    where proposal_id = p_proposal_id and user_id = p_user_id
    for update;

    if v_existing is null or jsonb_array_length(v_existing) = 0 then
      -- Our INSERT won. Done.
      return jsonb_build_array(p_entry);
    end if;
    -- Fall through: the concurrent insert won; append our entry to its array.
  end if;

  -- Step 2: combine existing array with new entry.
  v_combined := coalesce(v_existing, '[]'::jsonb) || jsonb_build_array(p_entry);

  -- Step 3: sort by entry timestamp DESC and slice to cap (D-29, D-30).
  with ordered as (
    select elem
    from jsonb_array_elements(v_combined) as elem
    order by (elem->>'timestamp')::timestamptz desc nulls last
    limit v_cap
  )
  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_capped from ordered;

  -- Step 4: write back. SECURITY INVOKER means RLS still applies.
  update chat_sessions
  set resolved_items = v_capped,
      last_updated   = now()
  where proposal_id = p_proposal_id and user_id = p_user_id;

  return v_capped;
end;
$$;

revoke all on function public.append_resolved_item(uuid, uuid, uuid, jsonb) from public;
grant execute on function public.append_resolved_item(uuid, uuid, uuid, jsonb) to authenticated;
