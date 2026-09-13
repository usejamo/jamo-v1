-- Todo #7 — permanent delete has never worked.
--
-- proposals has RLS enabled and DELETE is granted to `authenticated` at the
-- table level, but there was no DELETE policy at all. With RLS on and no
-- policy, every client DELETE matches zero rows and returns NO error — so
-- ProposalsContext.permanentlyDelete() resolved successfully, the UI showed
-- "Proposal permanently deleted", and the row never went anywhere. Measured
-- in-browser 2026-09-12: the row was still present in the DB afterwards.
--
-- Scope deliberately mirrors proposals_select_deleted:
--   * org-scoped via private.get_user_org_id()
--   * admin / super_admin only (clients must not hard-delete)
--   * deleted_at IS NOT NULL — a proposal must be soft-deleted (in Trash)
--     before it can be destroyed. This keeps "Delete Forever" reachable only
--     from the Deleted tab and means a stray client call can never hard-delete
--     a live proposal.
--
-- Functions are wrapped in (SELECT ...) so they are evaluated once per
-- statement rather than once per row, matching the other proposals policies.
--
-- Cascade behaviour was checked before writing this: every FK referencing
-- proposals is ON DELETE CASCADE (chat_sessions, chunks, demo_runs,
-- proposal_assumptions, proposal_chats, proposal_section_versions,
-- proposal_sections) or SET NULL (proposal_documents, usage_events), so no
-- RESTRICT/NO ACTION constraint blocks the delete.

CREATE POLICY "proposals_delete" ON proposals
  FOR DELETE TO authenticated
  USING (
    org_id = (SELECT private.get_user_org_id())
    AND deleted_at IS NOT NULL
    AND (SELECT private.get_user_role()) IN ('admin', 'super_admin')
  );
