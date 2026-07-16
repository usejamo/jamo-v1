// supabase/functions/team-invite/index.ts
// Org-admin, same-org: invites a teammate (role admin/user) into the CALLER'S
// OWN org (reqs 6/8). Tier-2 of the two-tier invite model (D-11) — unlike
// admin-invite-first-admin (super_admin, cross-org), this function is
// same-org-only and caps the invite role so an org admin can never mint a
// super_admin (T-15-21) or invite into another org (T-15-22).
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'
import { createInvite, revokeInvite, findAuthUserIdByEmail } from '../_shared/invites.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    let userId: string
    let callerOrgId: string
    try {
      ({ userId, orgId: callerOrgId } = await getAuthedUserAndOrg(req, corsHeaders))
    } catch (e) {
      if (e instanceof Response) return e
      throw e
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Caller must be an org admin (or super_admin) to invite teammates.
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'admin' && callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'admin required', corsHeaders)
    }

    const { email, role, org_id: requestOrgId, action, inviteId } = (await req.json()) as {
      email?: string
      role?: string
      org_id?: string
      action?: 'resend' | 'revoke'
      inviteId?: string
    }

    // Own-org pending-invites sub-list (req 8, plan 10): resend/revoke are
    // scoped to invites the caller's own org owns — mirrors
    // admin-invites-lifecycle's resend(=revoke-then-reissue)/revoke shape,
    // but same-org only (T-15-34) instead of super_admin cross-org.
    if (action === 'resend' || action === 'revoke') {
      if (!inviteId || typeof inviteId !== 'string') {
        return jsonError(400, 'inviteId is required', corsHeaders)
      }
      const { data: existingInvite, error: loadErr } = await admin
        .from('invites')
        .select('id, email, org_id, role, status')
        .eq('id', inviteId)
        .single()
      if (loadErr || !existingInvite) {
        return jsonError(404, 'invite not found', corsHeaders)
      }
      if (existingInvite.org_id !== callerOrgId) {
        return jsonError(403, 'org mismatch', corsHeaders)
      }
      if (existingInvite.role === 'super_admin') {
        // T-15-33 defense in depth: team scope never touches a super_admin
        // invite even if one somehow shares the caller's org.
        return jsonError(403, 'cannot manage super_admin invite', corsHeaders)
      }

      const authUserId = await findAuthUserIdByEmail(admin, existingInvite.email)
      await revokeInvite(admin, inviteId, authUserId, corsHeaders)

      if (action === 'revoke') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // resend = revoke-then-reissue (Pitfall 4), never a second
      // invite-email admin call on the still-pending email.
      const { invite: reissuedInvite } = await createInvite(
        admin,
        {
          email: existingInvite.email,
          orgId: existingInvite.org_id,
          role: existingInvite.role,
          invitedBy: userId,
          siteUrl: Deno.env.get('SITE_URL'),
        },
        corsHeaders
      )
      return new Response(JSON.stringify({ invite: reissuedInvite }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!email || typeof email !== 'string') {
      return jsonError(400, 'email is required', corsHeaders)
    }
    if (!role || (role !== 'admin' && role !== 'user')) {
      // T-15-21/D-01: role cap — an org admin can only mint admin/user
      // teammates. super_admin is explicitly rejected here, never minted by
      // a team-invite call regardless of what the body requests.
      if (role === 'super_admin') {
        return jsonError(403, 'cannot invite super_admin', corsHeaders)
      }
      return jsonError(400, "role must be 'admin' or 'user'", corsHeaders)
    }

    // T-15-22: a team invite is always into the caller's own org — never a
    // body-supplied targetOrgId. If the body carries an org_id that differs
    // from callerOrgId, reject as a tamper attempt (mirrors
    // salesforce-oauth-initiate's org-mismatch check).
    if (requestOrgId && requestOrgId !== callerOrgId) {
      return jsonError(403, 'org mismatch', corsHeaders)
    }

    const { invite } = await createInvite(
      admin,
      {
        email,
        orgId: callerOrgId,
        role,
        invitedBy: userId,
        siteUrl: Deno.env.get('SITE_URL'),
      },
      corsHeaders
    )

    return new Response(JSON.stringify({ invite }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
