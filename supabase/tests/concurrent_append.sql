-- Phase 14.2.2 — Concurrent append safety (D-27).
--
-- W4 closure: pgtap cannot meaningfully test parallel sessions (no session-fork
-- primitive). This file therefore:
--   (a) sanity-checks SEQUENTIAL back-to-back writes — 5 RPC calls from the
--       same session, each must land (FOR UPDATE serialization is exercised);
--   (b) explicitly DEFERS the true parallel race verification to the manual
--       checkpoint in Task 4 (multi-tab race) — per W4 closure, the multi-tab
--       race serves as the PRIMARY D-27 verification signal.
--
-- The FOR UPDATE row-lock contract is a Postgres guarantee; the runtime
-- evidence comes from the manual two-tab dismiss test.

begin;
select plan(2);

-- Seed: ephemeral test user.
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'c@test.local')
on conflict (id) do nothing;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

-- ----------------------------------------------------------------------------
-- Test 1: 5 sequential back-to-back appends from the SAME session all land.
-- Each call goes through the FOR UPDATE path (after the first upsert), so this
-- exercises the lock-acquire / release cycle that would also serialize true
-- parallel callers.
-- ----------------------------------------------------------------------------
do $$
declare i int;
begin
  for i in 1..5 loop
    perform public.append_resolved_item(
      '00000000-0000-0000-0000-000000000ddd'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '00000000-0000-0000-0000-000000000bbb'::uuid,
      jsonb_build_object(
        'originating_action_id', 'e' || i,
        'section_key', 's',
        'finding_type', 'gap',
        'title', 't' || i,
        'description', 'd',
        'user_action', 'dismissed',
        'applied_changes', '',
        'section_content_hash_at_action', 'h',
        'timestamp', to_char(timestamp '2026-05-28' + (i * interval '1 second'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    );
  end loop;
end $$;

select is(
  (select jsonb_array_length(resolved_items) from public.chat_sessions
   where proposal_id = '00000000-0000-0000-0000-000000000ddd'
     and user_id = '33333333-3333-3333-3333-333333333333'),
  5,
  'five sequential appends all land (no append lost; FOR UPDATE serialization exercised)'
);

-- ----------------------------------------------------------------------------
-- Test 2: Newest entry sorted first after all 5 appends.
-- ----------------------------------------------------------------------------
select is(
  (select resolved_items->0->>'originating_action_id' from public.chat_sessions
   where proposal_id = '00000000-0000-0000-0000-000000000ddd'
     and user_id = '33333333-3333-3333-3333-333333333333'),
  'e5',
  'newest entry (e5) sorted first under timestamp DESC'
);

select finish();
rollback;

-- ============================================================================
-- TRUE CONCURRENT (parallel) VERIFICATION:
--
-- Deferred to the Task 4 MANUAL checkpoint (D-27):
--   - Open the same proposal in two browser tabs as the same user.
--   - Dismiss a different action item in each tab simultaneously.
--   - Refresh both tabs.
--   - Expected: both resolved_items entries are present (no append lost
--     to the race).
--
-- pgtap cannot fork sessions; the FOR UPDATE contract is a Postgres-level
-- guarantee. Per W4 closure, the multi-tab race serves as the primary D-27
-- verification signal — this file's role is to confirm the sequential-write
-- contract that the FOR UPDATE path produces.
-- ============================================================================
