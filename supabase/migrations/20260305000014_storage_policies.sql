-- Storage RLS for the 'documents' bucket (created via dashboard in Task 1)
-- Path convention: {org_id}/{proposal_id}/{filename}
-- (storage.foldername(name))[1] returns the first path segment = org_id
-- private.get_user_org_id() returns the calling user's org_id (SECURITY DEFINER)
-- Cast to text because foldername returns text but org_id is UUID
-- NOTE: private.get_user_org_id() is defined in migration 012 (Plan 02).
-- This migration runs AFTER 012 because Plan 04 pushes all migrations atomically
-- in numeric order (010 < 011 < 012 < 013 < 014).

-- INSERT: only into own org's folder
CREATE POLICY "storage_insert_own_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );

-- SELECT: only from own org's folder
CREATE POLICY "storage_select_own_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );

-- UPDATE: only own org's folder
CREATE POLICY "storage_update_own_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );

-- DELETE: only own org's folder
CREATE POLICY "storage_delete_own_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT (private.get_user_org_id())::text
    )
  );

-- usage_events RLS: org-scoped read; insert from own org only
-- (uses same helper as table policies from migration 012)
CREATE POLICY "usage_events_all" ON usage_events
  FOR ALL TO authenticated
  USING (org_id = (SELECT private.get_user_org_id()))
  WITH CHECK (org_id = (SELECT private.get_user_org_id()));
