-- Migration: 20260710000004_eligibility_write_gating.sql
-- Phase 14.7 (Proposal-History Scoping), Plan 03 — admin-gated write path for the
-- confidentiality-boundary controls (org master switches + per-proposal reference_override).
--
-- RESEARCH Pitfall 2: the ONLY write policy on `organizations` is `orgs_super_admin`
-- (ALL, role='super_admin'). A regular org `admin` has NO write path today.
-- RESEARCH Pitfall 3: `proposals_update` RLS is `org_id = get_user_org_id()` with NO role
-- clause — any org member can already `.update({reference_override})` directly.
--
-- Both gaps are closed here via dedicated SECURITY DEFINER RPCs (not a broad RLS UPDATE
-- policy) per RESEARCH's "Don't Hand-Roll" guidance and D-02's "express the rule once"
-- convention — this avoids incidentally opening `plan`/`slug`/`is_active` to org-admins.
--
-- Existing `proposals_update` / `organizations` RLS policies are intentionally left
-- untouched: `proposals_update` stays broad for legitimate status/title edits; the UI
-- writes `reference_override` ONLY via `set_reference_override` below, never a raw
-- table update.

-- ============================================================
-- 1. set_reference_override — admin-gated, org-scoped, tri-state (NULL/true/false)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_reference_override(p_proposal_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT role FROM user_profiles WHERE user_id = auth.uid()) NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE proposals SET reference_override = p_value
    WHERE id = p_proposal_id
      AND org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid());
END;
$$;

-- ============================================================
-- 2. set_org_learning_switches — admin-gated, org-scoped, column-scoped to the 3 switches
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_org_learning_switches(
  p_learn_from_won boolean, p_learn_from_submitted boolean, p_learn_from_lost boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT role FROM user_profiles WHERE user_id = auth.uid()) NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE organizations
     SET learn_from_won = p_learn_from_won,
         learn_from_submitted = p_learn_from_submitted,
         learn_from_lost = p_learn_from_lost
   WHERE id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid());
END;
$$;

-- ============================================================
-- 3. REVOKE/GRANT footer — mutation RPCs must not be callable by PUBLIC/anon
-- ============================================================
REVOKE ALL ON FUNCTION public.set_reference_override(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_reference_override(uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_org_learning_switches(boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_learning_switches(boolean, boolean, boolean) TO authenticated, service_role;
