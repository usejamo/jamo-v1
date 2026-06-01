-- Phase 14.2.2 — RPC contract tests for append_resolved_item.
-- Verifies: upsert-if-missing (D-28), cap-at-25 + sort-by-timestamp DESC (D-29, D-30),
-- SECURITY INVOKER (B4 closure invariant), idempotent EXECUTE grant.
--
-- Run via: supabase test db (pgtap). Not yet wired to CI — committed for future
-- harness hookup and manual psql runs.

begin;
select plan(6);

-- Seed: ephemeral test user (and org if WITH CHECK validates it).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local')
on conflict (id) do nothing;

-- Switch to authenticated role + claims so RLS WITH CHECK passes.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ----------------------------------------------------------------------------
-- Test 1: Upsert-if-missing (D-28).
-- First RPC call for a (proposal, user) with no existing chat_sessions row
-- should INSERT the row with a 1-entry resolved_items array.
-- ----------------------------------------------------------------------------
select is(
  jsonb_array_length(public.append_resolved_item(
    '00000000-0000-0000-0000-000000000aaa'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '00000000-0000-0000-0000-000000000bbb'::uuid,
    jsonb_build_object(
      'originating_action_id', 'a1',
      'section_key', 's',
      'finding_type', 'gap',
      'title', 't',
      'description', 'd',
      'user_action', 'dismissed',
      'applied_changes', '',
      'section_content_hash_at_action', 'h',
      'timestamp', '2026-05-28T00:00:00Z'
    )
  )),
  1,
  'first call upserts row and returns 1-entry array'
);

-- ----------------------------------------------------------------------------
-- Test 2: Cap-at-25 by timestamp DESC (D-29).
-- Append 30 more entries with monotonically increasing timestamps. Cap should
-- hold at 25.
-- ----------------------------------------------------------------------------
do $$
declare i int;
begin
  for i in 1..30 loop
    perform public.append_resolved_item(
      '00000000-0000-0000-0000-000000000aaa'::uuid,
      '11111111-1111-1111-1111-111111111111'::uuid,
      '00000000-0000-0000-0000-000000000bbb'::uuid,
      jsonb_build_object(
        'originating_action_id', 'a' || i,
        'section_key', 's',
        'finding_type', 'gap',
        'title', 't' || i,
        'description', 'd',
        'user_action', 'dismissed',
        'applied_changes', '',
        'section_content_hash_at_action', 'h',
        'timestamp', to_char(timestamp '2026-05-28' + (i * interval '1 minute'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    );
  end loop;
end $$;

select is(
  (select jsonb_array_length(resolved_items) from public.chat_sessions
   where proposal_id = '00000000-0000-0000-0000-000000000aaa'
     and user_id = '11111111-1111-1111-1111-111111111111'),
  25,
  'cap holds at 25 after 31 total appends'
);

-- ----------------------------------------------------------------------------
-- Test 3: Sort by timestamp DESC — newest entry is first (D-30).
-- ----------------------------------------------------------------------------
select is(
  (select resolved_items->0->>'originating_action_id' from public.chat_sessions
   where proposal_id = '00000000-0000-0000-0000-000000000aaa'
     and user_id = '11111111-1111-1111-1111-111111111111'),
  'a30',
  'newest entry (a30) is first after timestamp DESC sort'
);

-- ----------------------------------------------------------------------------
-- Test 4: Oldest entries rolled off — a1 (initial upsert) should be gone.
-- ----------------------------------------------------------------------------
select is(
  (select count(*)::int from jsonb_array_elements(
     (select resolved_items from public.chat_sessions
      where proposal_id = '00000000-0000-0000-0000-000000000aaa'
        and user_id = '11111111-1111-1111-1111-111111111111')
   ) elem where elem->>'originating_action_id' = 'a1'),
  0,
  'oldest entry (a1) rolled off after cap'
);

-- ----------------------------------------------------------------------------
-- Test 5: SECURITY INVOKER (B4 closure invariant — prosecdef=false).
-- ----------------------------------------------------------------------------
select is(
  (select prosecdef from pg_proc
   where proname = 'append_resolved_item'
     and pronamespace = 'public'::regnamespace),
  false,
  'append_resolved_item is SECURITY INVOKER (prosecdef=false)'
);

-- ----------------------------------------------------------------------------
-- Test 6: Idempotent grant — re-issuing the EXECUTE grant must be a no-op.
-- Switch back to a privileged role to issue the grant.
-- ----------------------------------------------------------------------------
reset role;
select lives_ok(
  $$ grant execute on function public.append_resolved_item(uuid, uuid, uuid, jsonb) to authenticated $$,
  'idempotent grant: re-issuing EXECUTE grant raises no exception'
);

select finish();
rollback;
