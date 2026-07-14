// supabase/functions/team-invite/index.ts
// Org-admin, same-org: invites a teammate (role admin/user) into the CALLER'S
// OWN org (reqs 6/8). Tier-2 of the two-tier invite model (D-11) — unlike
// admin-invite-first-admin (super_admin, cross-org), this function is
// same-org-only and caps the invite role so an org admin can never mint a
// super_admin (T-15-21) or invite into another org (T-15-22).
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'
import { createInvite } from '../_shared/invites.ts'

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

    const { email, role, org_id: requestOrgId } = (await req.json()) as {
      email?: string
      role?: string
      org_id?: string
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
        siteUrl: Deno.env.get('SITE_URL') ?? '',
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
