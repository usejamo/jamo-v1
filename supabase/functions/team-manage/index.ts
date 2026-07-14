// supabase/functions/team-manage/index.ts
// Org-admin, same-org: change a teammate's role, or deactivate/reactivate a
// teammate (req 7). Deactivation uses the real authentication-blocking
// mechanism (`ban_duration` at the auth layer, Pitfall 3) plus the
// denormalized `user_profiles.is_active` flag as a UI mirror. Every write is
// gated to targets whose org_id matches the caller's own org (T-15-22); a
// super_admin can never be targeted or minted via this function (T-15-24).
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ManageAction = 'change_role' | 'deactivate' | 'reactivate' | 'list_members'

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

    // Caller must be an org admin (or super_admin) to manage teammates.
    const { data: callerProfile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('user_id', userId)
      .single()
    if (callerProfile?.role !== 'admin' && callerProfile?.role !== 'super_admin') {
      return jsonError(403, 'admin required', corsHeaders)
    }

    const { action, targetUserId, role } = (await req.json()) as {
      action?: ManageAction
      targetUserId?: string
      role?: string
    }

    // list_members: TeamTab's member list — user_profiles has no email
    // column (auth.users owns it), so this same-org, admin-gated read joins
    // each profile to its auth user via the service-role client. No
    // targetUserId is involved; scoped entirely to callerOrgId (T-15-34).
    if (action === 'list_members') {
      const { data: members, error: listErr } = await admin
        .from('user_profiles')
        .select('user_id, full_name, role, is_active, created_at')
        .eq('org_id', callerOrgId)
        .order('created_at', { ascending: true })
      if (listErr) return jsonError(500, listErr.message, corsHeaders)
      const withEmail = await Promise.all(
        (members ?? []).map(async (m: { user_id: string; full_name: string | null; role: string; is_active: boolean; created_at: string }) => {
          const { data: userRes } = await admin.auth.admin.getUserById(m.user_id)
          return { ...m, email: userRes?.user?.email ?? null }
        })
      )
      return new Response(JSON.stringify({ members: withEmail }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!targetUserId || typeof targetUserId !== 'string') {
      return jsonError(400, 'targetUserId is required', corsHeaders)
    }
    if (action !== 'change_role' && action !== 'deactivate' && action !== 'reactivate') {
      return jsonError(400, 'unknown action', corsHeaders)
    }

    // T-15-22/req 7: load the target profile BEFORE any write, and reject if
    // the target's org_id doesn't match the caller's own org — team-manage
    // can never reach across a tenant boundary.
    const { data: target } = await admin
      .from('user_profiles')
      .select('org_id, role')
      .eq('user_id', targetUserId)
      .single()
    if (!target || target.org_id !== callerOrgId) {
      return jsonError(403, 'target not in caller org', corsHeaders)
    }
    // T-15-24/D-08: no super_admin can ever be targeted by this same-org
    // function — role change, deactivate, and reactivate all reject it.
    if (target.role === 'super_admin') {
      return jsonError(403, 'cannot manage super_admin', corsHeaders)
    }

    if (action === 'change_role') {
      if (!role || (role !== 'admin' && role !== 'user')) {
        // Cap: an org admin can only assign admin/user — never super_admin.
        if (role === 'super_admin') {
          return jsonError(403, 'cannot assign super_admin', corsHeaders)
        }
        return jsonError(400, "role must be 'admin' or 'user'", corsHeaders)
      }
      const { error: roleErr } = await admin
        .from('user_profiles')
        .update({ role })
        .eq('user_id', targetUserId)
      if (roleErr) return jsonError(400, roleErr.message, corsHeaders)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'deactivate') {
      // Pitfall 3: ban_duration at the auth layer is the REAL block —
      // rejected at GoTrue before RLS is ever evaluated. is_active is only a
      // denormalized UI mirror, never the sole enforcement mechanism.
      const { error: banErr } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: '87600h',
      })
      if (banErr) return jsonError(400, banErr.message, corsHeaders)
      await admin.from('user_profiles').update({ is_active: false }).eq('user_id', targetUserId)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // action === 'reactivate'
    const { error: unbanErr } = await admin.auth.admin.updateUserById(targetUserId, {
      ban_duration: 'none',
    })
    if (unbanErr) return jsonError(400, unbanErr.message, corsHeaders)
    await admin.from('user_profiles').update({ is_active: true }).eq('user_id', targetUserId)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
