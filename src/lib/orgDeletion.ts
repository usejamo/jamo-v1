// Pure org-deletion guard logic. Unit-tested here; also duplicated (not
// imported) inside supabase/functions/admin-delete-org/index.ts because the
// Deno edge runtime cannot resolve src/lib/ imports at deploy time (same
// convention as baseSlug/chunker.ts per 14.6-PATTERNS / admin-create-org).
// Keep both copies in sync manually if this logic changes.
export interface OrgDeletionMember {
  email?: string | null
  role: string
}

/** Why deletion was refused. The `code` is what callers branch on — never the
 *  message. The message is user-facing prose and is expected to be reworded;
 *  since this module is hand-duplicated into the edge function, branching on
 *  wording would silently break the moment one copy is edited and the other
 *  is not. */
export type OrgDeletionBlockCode = 'name_mismatch' | 'super_admin_member'

export interface OrgDeletionBlock {
  code: OrgDeletionBlockCode
  message: string
}

/**
 * Returns the reason deletion must NOT proceed, or null when it may proceed.
 * Checked in this order:
 *
 *  1. Name confirmation (server-side, UX-independent) — confirmName is
 *     trimmed before comparison; orgName is compared as-is.
 *  2. The super_admin guard — role lives on user_profiles, and
 *     user_profiles.org_id is ON DELETE CASCADE, so deleting the org would
 *     destroy the super_admin's profile AND their role. Members' auth
 *     accounts are deleted too, so a super_admin deleting their own org
 *     would delete themselves mid-request, leaving no super_admin to undo
 *     it. Refuse whenever ANY member of the org is a super_admin, naming
 *     the blocking account(s) so the caller knows who to move first.
 */
export function blockReasonForOrgDeletion({
  orgName,
  confirmName,
  members,
}: {
  orgName: string
  confirmName: string
  members: OrgDeletionMember[]
}): OrgDeletionBlock | null {
  if (confirmName.trim() !== orgName) {
    return { code: 'name_mismatch', message: 'Name does not match' }
  }
  return superAdminBlockReason(members)
}

/**
 * The standing, typing-independent reason an org cannot be deleted.
 *
 * Split out from blockReasonForOrgDeletion because a PREVIEW must not apply
 * the name check: preview runs when the dialog opens, before the user has
 * typed anything, so folding the name check in would report "Name does not
 * match" every time and mask the real (super_admin) reason behind it.
 * Name confirmation is a submit-time gate; this is a state-of-the-world gate.
 */
export function superAdminBlockReason(members: OrgDeletionMember[]): OrgDeletionBlock | null {
  const superAdmins = members.filter((m) => m.role === 'super_admin')
  if (superAdmins.length > 0) {
    const names = superAdmins.map((m) => m.email || 'unknown').join(', ')
    const verb = superAdmins.length === 1 ? 'is a super_admin' : 'are super_admins'
    return {
      code: 'super_admin_member',
      message: `Cannot delete: ${names} ${verb} in this organization. Move them to another organization first.`,
    }
  }

  return null
}
