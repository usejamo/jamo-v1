-- Enable RLS on all org-scoped tables
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_extracts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_assumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_chats       ENABLE ROW LEVEL SECURITY;
-- Note: regulatory_chunks has NO RLS — shared platform resource (Plans 02+03)

-- ORGANIZATIONS: each user sees only their own org
CREATE POLICY "orgs_select" ON organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT private.get_user_org_id()));

CREATE POLICY "orgs_super_admin" ON organizations
  FOR ALL TO authenticated
  USING ((SELECT private.get_user_role()) = 'super_admin');

-- USER_PROFILES: org-scoped select; own-row update only
CREATE POLICY "profiles_select" ON user_profiles
  FOR SELECT TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "profiles_update" ON user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- PROPOSALS: org-scoped CRUD; deleted_at IS NULL filters soft-deletes from SELECT
CREATE POLICY "proposals_select" ON proposals
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND deleted_at IS NULL
  );

CREATE POLICY "proposals_select_deleted" ON proposals
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND deleted_at IS NOT NULL
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  );

CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT TO authenticated
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()));

-- CHILD TABLES: single ALL policy — org_id match required for both read and write
CREATE POLICY "proposal_sections_all" ON proposal_sections
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposal_documents_all" ON proposal_documents
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "document_extracts_all" ON document_extracts
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposal_assumptions_all" ON proposal_assumptions
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

CREATE POLICY "proposal_chats_all" ON proposal_chats
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));

-- AUTH TRIGGER: auto-create user_profiles row on signup
-- Expects raw_user_meta_data to contain: org_id, role (optional), full_name (optional)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO user_profiles (user_id, org_id, role, full_name)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'org_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
