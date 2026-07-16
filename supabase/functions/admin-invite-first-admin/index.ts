// supabase/functions/admin-invite-first-admin/index.ts
// super_admin-only, cross-org: invites the first admin for a newly created
// org (req 4). Service-role edge function — asserts super_admin from the
// VERIFIED JWT (D-08/D-10/T-15-12), and hardcodes role='admin' server-side
// (T-15-13) — role is NEVER read from the request body.
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
    try {
      ({ userId } = await getAuthedUserAndOrg(req, corsHeaders))
    } catch (e) {
      if (e instanceof Response) return e
      throw e
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // T-15-12/D-08: super_admin asserted from the verified JWT's user_profiles
    // row, never implied by merely reaching this endpoint.
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'super_admin required', corsHeaders)
    }

    // Only email + targetOrgId are read from the body — role is never
    // destructured here at all (T-15-13/req 4: no chance of a stray body
    // role reference compiling silently).
    const { email, targetOrgId } = (await req.json()) as { email?: string; targetOrgId?: string }
    if (!email || typeof email !== 'string') {
      return jsonError(400, 'email is required', corsHeaders)
    }
    if (!targetOrgId || typeof targetOrgId !== 'string') {
      return jsonError(400, 'targetOrgId is required', corsHeaders)
    }

    // targetOrgId may legitimately differ from the caller's own org — that is
    // the whole point of this cross-org op, which is why it requires
    // super_admin rather than the same-org team-invite path (plan 06).
    const { invite } = await createInvite(
      admin,
      {
        email,
        orgId: targetOrgId,
        role: 'admin',
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
