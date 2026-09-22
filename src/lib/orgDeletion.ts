// Pure org-deletion guard logic. Unit-tested here; also duplicated (not
// imported) inside supabase/functions/admin-delete-org/index.ts because the
// Deno edge runtime cannot resolve src/lib/ imports at deploy time (same
// convention as baseSlug/chunker.ts per 14.6-PATTERNS / admin-create-org).
// Keep both copies in sync manually if this logic changes.
export interface OrgDeletionMember {
  email?: string | null
  role: string
}

/**
 * Returns the exact user-facing reason deletion must NOT proceed, or null
 * when it may proceed. Checked in this order:
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
}): string | null {
  if (confirmName.trim() !== orgName) {
    return 'Name does not match'
  }

  const superAdmins = members.filter((m) => m.role === 'super_admin')
  if (superAdmins.length > 0) {
    const names = superAdmins.map((m) => m.email || 'unknown').join(', ')
    const verb = superAdmins.length === 1 ? 'is a super_admin' : 'are super_admins'
    return `Cannot delete: ${names} ${verb} in this organization. Move them to another organization first.`
  }

  return null
}
