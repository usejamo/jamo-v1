// supabase/functions/admin-invites-lifecycle/index.ts
// super_admin-only, cross-org: lists / resends / revokes invites (req 8).
// Service-role edge function — asserts super_admin from the VERIFIED JWT
// (D-08/D-10/T-15-17), never implied by merely reaching this endpoint.
//
// Resend is deliberately implemented as revoke-then-reissue (NOT a second
// invite-email admin call on a still-pending email) — see 15-RESEARCH.md
// Pitfall 4: GoTrue's re-invite behavior on an already-invited unconfirmed
// user is ambiguous/inconsistent across versions, so this sidesteps it
// entirely by always minting a brand-new auth user + pending invites row
// (createInvite handles that admin call internally, in _shared/invites.ts).
//
// Revoke (D-06): `auth.admin.deleteUser` FK-cascades the profile, and the
// invites row is flagged `revoked` — the handle_new_user trigger's
// `status='pending'` filter means a revoked row can never bind even if the
// underlying (now-deleted) auth user somehow still existed.
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'
import { createInvite, revokeInvite } from '../_shared/invites.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InviteRow {
  id: string
  email: string
  org_id: string
  role: 'super_admin' | 'admin' | 'user'
  status: 'pending' | 'accepted' | 'revoked'
}

// No email-filter query param exists on the GoTrue admin listUsers API in
// supabase-js v2 — paginate and match client-side. Capped at 25 pages of 200
// (5,000 users) so a lookup can never loop unbounded; an admin invite-mgmt
// tool operating at that scale would need a dedicated index/RPC, not this.
async function findAuthUserIdByEmail(
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

    // T-15-17: super_admin asserted from the verified JWT's user_profiles
    // row, never implied by merely reaching this endpoint.
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'super_admin required', corsHeaders)
    }

    const { action, inviteId } = (await req.json()) as { action?: string; inviteId?: string }

    if (action === 'list') {
      // Cross-org visibility via the service-role client (bypasses RLS) —
      // D-08/T-15-20: intentional, gated by the super_admin check above.
      const { data: invites, error } = await admin
        .from('invites')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false })
      if (error) {
        return jsonError(500, error.message, corsHeaders)
      }
      return new Response(JSON.stringify({ invites }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!inviteId || typeof inviteId !== 'string') {
      return jsonError(400, 'inviteId is required', corsHeaders)
    }

    const { data: invite, error: loadErr } = await admin
      .from('invites')
      .select('id, email, org_id, role, status')
      .eq('id', inviteId)
      .single<InviteRow>()
    if (loadErr || !invite) {
      return jsonError(404, 'invite not found', corsHeaders)
    }

    if (action === 'revoke') {
      // T-15-18/D-06: resolve the auth user (if one already exists for this
      // email) and delete it — kills the underlying link token — then flag
      // the row revoked. A still-pending invite has no auth user yet, so
      // authUserId may legitimately be undefined.
      const authUserId = await findAuthUserIdByEmail(admin, invite.email)
      await revokeInvite(admin, inviteId, authUserId, corsHeaders)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'resend') {
      // T-15-19/Pitfall 4: revoke-then-reissue, never a second invite-email
      // admin call on the still-pending email. Delete the stale (likely
      // unconfirmed) auth user + flag the old row revoked FIRST, then mint
      // an entirely fresh pending invite + auth user + email via
      // createInvite (which owns the D-03 insert-then-invite sequence).
      const authUserId = await findAuthUserIdByEmail(admin, invite.email)
      await revokeInvite(admin, inviteId, authUserId, corsHeaders)

      const { invite: newInvite } = await createInvite(
        admin,
        {
          email: invite.email,
          orgId: invite.org_id,
          role: invite.role,
          invitedBy: userId,
          siteUrl: Deno.env.get('SITE_URL') ?? '',
        },
        corsHeaders
      )
      return new Response(JSON.stringify({ invite: newInvite }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return jsonError(400, 'unknown action', corsHeaders)
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
