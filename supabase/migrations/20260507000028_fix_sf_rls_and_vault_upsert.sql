-- Bug 1: RLS used user_profiles.id (internal PK) instead of user_id (auth UID).
-- Subquery always returned NULL → no rows visible to frontend.
-- Use private.get_user_org_id() — the established SECURITY DEFINER pattern.
DROP POLICY IF EXISTS sf_connections_select_own_org ON salesforce_connections;
DROP POLICY IF EXISTS sf_connections_delete_own_org ON salesforce_connections;

CREATE POLICY sf_connections_select_own_org ON salesforce_connections
  FOR SELECT USING (org_id = private.get_user_org_id());

CREATE POLICY sf_connections_delete_own_org ON salesforce_connections
  FOR DELETE USING (org_id = private.get_user_org_id());

-- Bug 2: vault.create_secret fails with unique constraint on reconnect (same p_name).
-- Delete existing secret with that name before inserting.
CREATE OR REPLACE FUNCTION public.vault_store_sf_tokens(p_payload jsonb, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  DELETE FROM vault.secrets WHERE name = p_name;
  SELECT vault.create_secret(p_payload::text, p_name, 'Salesforce OAuth tokens')
  INTO v_secret_id;
  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.vault_store_sf_tokens(p_payload jsonb, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  DELETE FROM vault.secrets WHERE name = p_name;
  SELECT vault.create_secret(p_payload::text, p_name, 'Salesforce OAuth tokens')
  INTO v_secret_id;
  RETURN v_secret_id;
END;
$$;
