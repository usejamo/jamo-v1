-- Phase 12: Salesforce OAuth integration
-- Creates salesforce_connections, oauth_pending tables, Vault wrapper functions, RLS, pg_cron cleanup

-- ============================================================
-- 1. salesforce_connections table (D-07)
-- Non-secret connection metadata — tokens are NEVER stored here
-- ============================================================
create table salesforce_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  sf_org_id text not null,
  sf_username text not null,
  instance_url text not null,
  is_sandbox boolean not null default false,
  vault_secret_id uuid not null,
  connected_at timestamptz not null default now(),
  unique(org_id)
);

-- ============================================================
-- 2. oauth_pending table (D-07)
-- Short-lived OAuth state with 5-minute TTL
-- ============================================================
create table oauth_pending (
  state text primary key,
  org_id uuid not null,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);

-- ============================================================
-- 3. Enable RLS on both tables
-- ============================================================
alter table salesforce_connections enable row level security;
alter table oauth_pending enable row level security;

-- ============================================================
-- 4. RLS policies for salesforce_connections
-- Org members can read/delete their org's connection.
-- INSERT/UPDATE is service_role only — no public policy needed.
-- ============================================================

-- Org members can read their org's connection
create policy "sf_connections_select_own_org"
  on salesforce_connections for select
  using (org_id = (select org_id from user_profiles where id = auth.uid()));

-- Org members can delete their org's connection
create policy "sf_connections_delete_own_org"
  on salesforce_connections for delete
  using (org_id = (select org_id from user_profiles where id = auth.uid()));

-- ============================================================
-- 5. RLS for oauth_pending
-- Service role only — no public access policy.
-- The service role bypasses RLS by default on Supabase.
-- ============================================================

-- ============================================================
-- 6. Vault wrapper functions in private schema
-- SECURITY DEFINER + REVOKE ALL from PUBLIC + GRANT to service_role
-- Required pattern: vault schema is not PostgREST-exposed (Pitfall 1)
-- ============================================================

-- Store tokens for a Salesforce connection
CREATE OR REPLACE FUNCTION private.vault_store_sf_tokens(
  p_payload jsonb,
  p_name text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT vault.create_secret(p_payload::text, p_name, 'Salesforce OAuth tokens')
  INTO v_secret_id;
  RETURN v_secret_id;
END;
$$;
REVOKE ALL ON FUNCTION private.vault_store_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_store_sf_tokens TO service_role;

-- Update existing tokens
CREATE OR REPLACE FUNCTION private.vault_update_sf_tokens(
  p_secret_id uuid,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  PERFORM vault.update_secret(p_secret_id, p_payload::text);
END;
$$;
REVOKE ALL ON FUNCTION private.vault_update_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_update_sf_tokens TO service_role;

-- Retrieve decrypted tokens
CREATE OR REPLACE FUNCTION private.vault_get_sf_tokens(
  p_secret_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = p_secret_id;
  RETURN v_secret::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION private.vault_get_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_get_sf_tokens TO service_role;

-- Delete tokens
CREATE OR REPLACE FUNCTION private.vault_delete_sf_tokens(
  p_secret_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;
REVOKE ALL ON FUNCTION private.vault_delete_sf_tokens FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.vault_delete_sf_tokens TO service_role;

-- ============================================================
-- 7. pg_cron cleanup job for expired oauth_pending rows
-- Runs every 5 minutes as a safety net (on-read TTL check is primary)
-- ============================================================
SELECT cron.schedule(
  'cleanup-oauth-pending',
  '*/5 * * * *',
  $$DELETE FROM oauth_pending WHERE expires_at < now()$$
);
