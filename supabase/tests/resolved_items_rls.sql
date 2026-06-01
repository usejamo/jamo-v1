-- Phase 14.2.2 — Cross-user isolation (AC5).
-- W4 closure: use lives_ok + post-assertion unchanged-row pattern instead of
-- the throws-with-NULL-message pattern (which is fragile across pgtap versions
-- and was the failure mode that motivated this rewrite).
--
-- Contract under test: User B cannot read User A's chat_sessions row, and
-- calling the RPC as User B targeting User A's row leaves User A's
-- resolved_items array UNCHANGED. SECURITY INVOKER + RLS WITH CHECK make the
-- attempted write a silent no-op (SELECT FOR UPDATE finds no row from B's
-- perspective; the INSERT path uses p_user_id=A which fails RLS WITH CHECK
-- silently for B's session).

begin;
select plan(3);

-- Seed: User A + User B in auth.users.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local')
on conflict (id) do nothing;

-- Insert User A's chat_sessions row directly (as superuser, bypassing RLS).
insert into public.chat_sessions (proposal_id, user_id, org_id, resolved_items)
values (
  '00000000-0000-0000-0000-000000000ccc',
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000bbb',
  jsonb_build_array(jsonb_build_object(
    'originating_action_id','aa',
    'section_key','s',
    'finding_type','gap',
    'title','t',
    'description','d',
    'user_action','dismissed',
    'applied_changes','',
    'section_content_hash_at_action','h',
    'timestamp','2026-05-28T00:00:00Z'
  ))
)
on conflict (proposal_id, user_id) do nothing;

-- Capture User A's pre-state into a GUC for post-assertion comparison.
do $$
begin
  perform set_config(
    'test.user_a_array_len_before',
    (select jsonb_array_length(resolved_items)::text
     from public.chat_sessions
     where proposal_id = '00000000-0000-0000-0000-000000000ccc'
       and user_id = '11111111-1111-1111-1111-111111111111'),
    true
  );
end $$;

-- ----------------------------------------------------------------------------
-- Switch to User B's authenticated session.
-- ----------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- ----------------------------------------------------------------------------
-- Test 1: RLS USING blocks B from SELECTing A's row.
-- ----------------------------------------------------------------------------
select is(
  (select count(*)::int from public.chat_sessions
   where proposal_id = '00000000-0000-0000-0000-000000000ccc'),
  0,
  'User B cannot SELECT User A''s chat_sessions row (RLS USING clause)'
);

-- ----------------------------------------------------------------------------
-- Test 2: B's RPC call targeting A's row LIVES (no exception raised).
-- W4 closure: lives_ok is more portable than the throws-with-NULL pattern.
-- ----------------------------------------------------------------------------
select lives_ok(
  $$ select public.append_resolved_item(
       '00000000-0000-0000-0000-000000000ccc'::uuid,
       '11111111-1111-1111-1111-111111111111'::uuid,
       '00000000-0000-0000-0000-000000000bbb'::uuid,
       jsonb_build_object(
         'originating_action_id','xx',
         'section_key','s',
         'finding_type','gap',
         'title','t',
         'description','d',
         'user_action','dismissed',
         'applied_changes','',
         'section_content_hash_at_action','h',
         'timestamp','2026-05-28T00:00:00Z'
       )
     ) $$,
  'User B''s RPC call against User A''s row does not raise (RLS handles silently)'
);

-- ----------------------------------------------------------------------------
-- Test 3: Post-assertion — User A's resolved_items array is UNCHANGED.
-- This is the contract that matters; lives_ok above is a portability hedge.
-- ----------------------------------------------------------------------------
reset role;
set local role postgres;

select is(
  (select jsonb_array_length(resolved_items) from public.chat_sessions
   where proposal_id = '00000000-0000-0000-0000-000000000ccc'
     and user_id = '11111111-1111-1111-1111-111111111111'),
  current_setting('test.user_a_array_len_before', true)::int,
  'User A''s resolved_items array length is UNCHANGED after User B''s call (per-user isolation holds)'
);

select finish();
rollback;
