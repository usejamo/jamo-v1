// supabase/functions/_shared/invites.ts
// Shared invite sequence — D-01/D-02/D-03: INSERT a pending invite row
// (committed FIRST) → call auth.admin.inviteUserByEmail (the handle_new_user
// trigger fires here and reads the already-committed row by email) → on
// failure, compensate by revoking the just-inserted row.
//
// Reused by admin-invite-first-admin (plan 04) and team-invite (plan 06) so
// the D-03 ordering lives in exactly one place. No Deno-specific top-level
// imports beyond the local `jsonError` re-export (Pattern A) — keeps this
// module loadable in both the Deno edge runtime and plain test runners.
import { jsonError } from './auth.ts'

export interface CreateInviteParams {
  email: string
  orgId: string
  role: 'super_admin' | 'admin' | 'user'
  invitedBy: string
  siteUrl: string
}

/**
 * D-03 sequence:
 *  1. INSERT the invites row with status 'pending' and commit it — this MUST
 *     happen before step 2 so the handle_new_user trigger (which reads
 *     invites by lower(email) + status='pending') always finds a match.
 *  2. auth.admin.inviteUserByEmail — this is what actually creates the
 *     auth.users row and fires the trigger.
 *  3. On failure of step 2, compensate: mark the row from step 1 'revoked' so
 *     no phantom pending invite is left behind, then throw a jsonError(400).
 *
 * Throws a Response (jsonError) on any failure — callers wrap this in
 * try/catch and, when the caught value is `instanceof Response`, return it
 * directly (same convention as _shared/auth.ts's getAuthedUserAndOrg).
 */
export async function createInvite(
  // deno-lint-ignore no-explicit-any
  admin: any,
  { email, orgId, role, invitedBy, siteUrl }: CreateInviteParams,
  corsHeaders: Record<string, string> = {}
): Promise<{ invite: Record<string, unknown> }> {
  const lowerEmail = email.toLowerCase()

  // D-03 step 1: insert + commit the pending invite row FIRST.
  const { data: invite, error: inviteErr } = await admin
    .from('invites')
    .insert({
      email: lowerEmail,
      org_id: orgId,
      role,
      invited_by: invitedBy,
      status: 'pending',
    })
    .select()
    .single()
  if (inviteErr) {
    throw jsonError(400, inviteErr.message, corsHeaders)
  }

  // D-03 step 2: auth.admin call — the handle_new_user trigger fires here and
  // finds the row committed in step 1 above.
  const { error: inviteEmailErr } = await admin.auth.admin.inviteUserByEmail(lowerEmail, {
    redirectTo: `${siteUrl}/accept-invite`,
  })
  if (inviteEmailErr) {
    // Compensate: revoke the pending row so it never lingers as a phantom
    // invite that could later be (mis)consumed.
    await admin.from('invites').update({ status: 'revoked' }).eq('id', invite.id)
    throw jsonError(400, inviteEmailErr.message, corsHeaders)
  }

  return { invite }
}

/**
 * Revokes an invite row and, when an auth user already exists for it (e.g. a
 * resend/deactivate flow reaching an already-accepted invite), deletes that
 * auth user too — this FK-cascades the user_profiles row (D-06).
 * authUserId is optional: a still-pending invite has no auth user yet.
 */
export async function revokeInvite(
  // deno-lint-ignore no-explicit-any
  admin: any,
  inviteId: string,
  authUserId?: string,
  corsHeaders: Record<string, string> = {}
): Promise<void> {
  const { error: updateErr } = await admin
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
  if (updateErr) {
    throw jsonError(400, updateErr.message, corsHeaders)
  }

  if (authUserId) {
    const { error: deleteErr } = await admin.auth.admin.deleteUser(authUserId)
    if (deleteErr) {
      throw jsonError(400, deleteErr.message, corsHeaders)
    }
  }
}
