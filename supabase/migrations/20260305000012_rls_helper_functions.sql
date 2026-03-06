-- Helper functions in private schema — not exposed via PostgREST API
-- SECURITY DEFINER: function runs with definer's privileges (bypasses RLS when reading user_profiles)
-- STABLE: Postgres can cache result within a single statement
-- SET search_path = public: prevents search_path injection attacks

CREATE OR REPLACE FUNCTION private.get_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM user_profiles WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.get_user_role()
RETURNS TEXT
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE user_id = (SELECT auth.uid());
$$;
