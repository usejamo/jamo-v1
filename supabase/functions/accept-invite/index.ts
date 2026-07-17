// supabase/functions/accept-invite/index.ts
// Called by the invitee immediately after they set their password on the
// /accept-invite page. Flips their own pending invite row to 'accepted' so it
// leaves the org admin's Pending Invites list.
//
// Why an edge function: the invitee is a plain 'user' with no RLS UPDATE on
// `invites`, so the status flip needs the service-role client. The update is
// triple-scoped to the caller's OWN org_id + OWN email + status='pending', so
// it can only ever touch the invitee's own still-pending invite — never
// another person's, another org's, or an already-revoked row.
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    let userId: string
    let orgId: string
    try {
      ({ userId, orgId } = await getAuthedUserAndOrg(req, corsHeaders))
    } catch (e) {
      if (e instanceof Response) return e
      throw e
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { full_name } = (await req.json().catch(() => ({}))) as { full_name?: string }

    // The invitee's email lives on auth.users, not user_profiles — resolve it
    // from the verified user id (never from the request body).
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId)
    const email = userRes?.user?.email?.toLowerCase()
    if (userErr || !email) {
      return jsonError(400, 'could not resolve caller email', corsHeaders)
    }

    // Mark ONLY the caller's own pending invite accepted. invites.email is
    // stored lowercased at creation (createInvite), matching the lowercased
    // auth email here.
    const { error: updateErr } = await admin
      .from('invites')
      .update({ status: 'accepted' })
      .eq('org_id', orgId)
      .eq('email', email)
      .eq('status', 'pending')
    if (updateErr) {
      return jsonError(400, updateErr.message, corsHeaders)
    }

    // Best-effort profile name write — never fail the accept over a missing/failed name.
    // userId comes from the verified JWT (getAuthedUserAndOrg), never the body.
    const fullName = (full_name ?? '').trim()
    if (fullName) {
      const { error: nameErr } = await admin
        .from('user_profiles')
        .update({ full_name: fullName })
        .eq('user_id', userId)
      if (nameErr) {
        console.error('accept-invite: failed to set full_name', nameErr.message)
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
