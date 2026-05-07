-- Fix: vault RPCs were in private schema (invisible to PostgREST).
-- Recreate in public so supabase.rpc() can reach them.
-- SECURITY DEFINER + REVOKE FROM PUBLIC keeps them service_role-only.

CREATE OR REPLACE FUNCTION public.vault_store_sf_tokens(p_payload jsonb, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT vault.create_secret(p_payload::text, p_name, 'Salesforce OAuth tokens')
  INTO v_secret_id;
  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_get_sf_tokens(p_secret_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
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

CREATE OR REPLACE FUNCTION public.vault_delete_sf_tokens(p_secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_secret_id;
END;
$$;

-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.vault_store_sf_tokens(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vault_get_sf_tokens(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vault_delete_sf_tokens(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_store_sf_tokens(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_get_sf_tokens(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_delete_sf_tokens(uuid) TO service_role;
