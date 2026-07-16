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

  // Fail loudly, and BEFORE inserting anything, if SITE_URL isn't an absolute URL.
  // An empty/relative siteUrl silently produced redirectTo='/accept-invite', which
  // GoTrue discards — falling back to site_url and dropping the invitee on the
  // dashboard with a live session and no password, never showing the set-password
  // step. That failed silently on every invite. Validate before step 1 so a
  // misconfigured deploy can't leave a phantom pending row behind either.
  let redirectTo: string
  try {
    redirectTo = new URL('/accept-invite', new URL(siteUrl)).toString()
  } catch {
    throw jsonError(500, 'SITE_URL is not configured as an absolute URL', corsHeaders)
  }

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
    redirectTo,
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

/**
 * Best-effort auth.users lookup by email — no email-filter query param exists
 * on the GoTrue admin listUsers API in supabase-js v2, so this paginates and
 * matches client-side. Capped at 25 pages of 200 (5,000 users) so a lookup
 * can never loop unbounded. Shared by admin-invites-lifecycle (cross-org) and
 * team-invite (same-org resend/revoke, plan 10) so the pagination cap lives
 * in exactly one place.
 */
export async function findAuthUserIdByEmail(
  // deno-lint-ignore no-explicit-any
  admin: any,
  email: string
): Promise<string | undefined> {
  const lowerEmail = email.toLowerCase()
  const perPage = 200
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error || !data?.users?.length) break
    const match = data.users.find(
      (u: { id: string; email?: string }) => u.email?.toLowerCase() === lowerEmail
    )
    if (match) return match.id
    if (data.users.length < perPage) break // last page reached
  }
  return undefined
}
