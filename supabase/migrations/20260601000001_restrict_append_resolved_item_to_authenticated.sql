-- Phase 14.2.2 corrective migration: restrict append_resolved_item EXECUTE to authenticated only.
--
-- The original migration (20260528120000_append_resolved_item_rpc.sql) issued
-- `revoke all on function ... from public; grant execute ... to authenticated;`
-- with the intent of authenticated-only access. However, Supabase's ALTER DEFAULT
-- PRIVILEGES auto-grants EXECUTE to anon, authenticated, and service_role on any
-- new function in the public schema. `REVOKE FROM PUBLIC` only revokes the PUBLIC
-- pseudo-role grant — it does NOT touch the explicit per-role grants Supabase adds.
--
-- This migration corrects the ACL by explicitly revoking from anon. service_role
-- retains EXECUTE (Postgres superuser bypass + service-side admin paths).
--
-- Defense-in-depth note: even with the original ACL, SECURITY INVOKER + the
-- chat_sessions RLS WITH CHECK (user_id = auth.uid()) blocked anon writes — but
-- the explicit revoke matches the original plan's must_have contract and removes
-- a confusing finding for future security audits.

revoke execute on function public.append_resolved_item(uuid, uuid, uuid, jsonb) from anon;

-- Post-condition (verify in psql / Supabase Studio):
--   SELECT
--     has_function_privilege('authenticated', 'public.append_resolved_item(uuid, uuid, uuid, jsonb)', 'EXECUTE'),  -- true
--     has_function_privilege('anon',          'public.append_resolved_item(uuid, uuid, uuid, jsonb)', 'EXECUTE'),  -- false
--     has_function_privilege('service_role',  'public.append_resolved_item(uuid, uuid, uuid, jsonb)', 'EXECUTE');  -- true
