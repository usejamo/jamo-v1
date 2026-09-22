// supabase/functions/admin-delete-org/index.ts
// super_admin-only, cross-org: hard-deletes an organization and its members.
// Service-role edge function — asserts super_admin from the VERIFIED JWT
// (D-08/D-10/T-15-12), never from the panel or the request body. DESTRUCTIVE:
// correctness and the guard matter more than speed.
import { createClient } from 'supabase'
import { getAuthedUserAndOrg, jsonError } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Duplicated from src/lib/orgDeletion.ts (unit-tested there) — the Deno edge
// runtime cannot resolve src/lib/ imports at deploy time. Keep in sync
// manually (same convention as baseSlug in admin-create-org/index.ts).
interface OrgDeletionMember {
  email?: string | null
  role: string
}

/** Callers branch on `code`, never on `message` — the message is user-facing
 *  prose, and this module is hand-duplicated, so wording WILL drift between
 *  the two copies. A status code that depended on wording would break
 *  silently the first time one copy was reworded. */
type OrgDeletionBlockCode = 'name_mismatch' | 'super_admin_member'

interface OrgDeletionBlock {
  code: OrgDeletionBlockCode
  message: string
}

function blockReasonForOrgDeletion({
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

    const { org_id, confirm_name, preview } = (await req.json()) as {
      org_id?: string
      confirm_name?: string
      preview?: boolean
    }
    if (!org_id || typeof org_id !== 'string') {
      return jsonError(400, 'org_id is required', corsHeaders)
    }
    if (typeof confirm_name !== 'string') {
      return jsonError(400, 'confirm_name is required', corsHeaders)
    }

    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('id, name')
      .eq('id', org_id)
      .single()
    if (orgError || !org) {
      return jsonError(404, 'Organization not found', corsHeaders)
    }

    // Members of the target org, with email joined from auth.users (which
    // owns it — user_profiles has no email column; same join pattern as
    // team-manage/index.ts list_members).
    const { data: memberRows, error: membersError } = await admin
      .from('user_profiles')
      .select('user_id, role')
      .eq('org_id', org_id)
    if (membersError) {
      return jsonError(500, membersError.message, corsHeaders)
    }
    const members = await Promise.all(
      (memberRows ?? []).map(async (m: { user_id: string; role: string }) => {
        const { data: userRes } = await admin.auth.admin.getUserById(m.user_id)
        return { user_id: m.user_id, role: m.role, email: userRes?.user?.email ?? null }
      })
    )

    // Step 4 (name confirmation) and step 5 (THE GUARD) both live in
    // blockReasonForOrgDeletion — never trust the client's own check.
    const blockReason = blockReasonForOrgDeletion({
      orgName: org.name,
      confirmName: confirm_name,
      members,
    })

    if (preview === true) {
      const [{ count: proposalsCount }, { count: invitesCount }, { count: chatSessionsCount }] =
        await Promise.all([
          admin.from('proposals').select('*', { count: 'exact', head: true }).eq('org_id', org_id),
          admin.from('invites').select('*', { count: 'exact', head: true }).eq('org_id', org_id),
          admin
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', org_id),
        ])
      return new Response(
        JSON.stringify({
          preview: true,
          org: { id: org.id, name: org.name },
          counts: {
            members: members.length,
            proposals: proposalsCount ?? 0,
            invites: invitesCount ?? 0,
            chat_sessions: chatSessionsCount ?? 0,
          },
          blocked: blockReason ? blockReason.message : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (blockReason) {
      // Name mismatch is a client bug (or a stale/tampered confirmation) —
      // 400. A real super_admin block is a legitimate, expected refusal —
      // 409 (conflict with current state, not malformed input).
      const status = blockReason.code === 'name_mismatch' ? 400 : 409
      return jsonError(status, blockReason.message, corsHeaders)
    }

    // Capture counts BEFORE deleting anything — needed for the response.
    const memberIds = members.map((m) => m.user_id)
    const [{ count: proposalsCount }, { count: invitesCount }, { count: chatSessionsCount }] =
      await Promise.all([
        admin.from('proposals').select('*', { count: 'exact', head: true }).eq('org_id', org_id),
        admin.from('invites').select('*', { count: 'exact', head: true }).eq('org_id', org_id),
        admin
          .from('chat_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', org_id),
      ])

    // Step 7: chat_sessions.org_id is NO ACTION (not CASCADE) — the org
    // delete would throw a foreign-key error without this.
    const { error: chatSessionsError } = await admin
      .from('chat_sessions')
      .delete()
      .eq('org_id', org_id)
    if (chatSessionsError) {
      return jsonError(500, chatSessionsError.message, corsHeaders)
    }

    // Step 8: invites.invited_by -> auth.users is NO ACTION and nullable. A
    // member who invited someone in a DIFFERENT org would otherwise block
    // their own auth account deletion at step 10. Null it out first.
    if (memberIds.length > 0) {
      const { error: nullInvitedByError } = await admin
        .from('invites')
        .update({ invited_by: null })
        .in('invited_by', memberIds)
      if (nullInvitedByError) {
        return jsonError(500, nullInvitedByError.message, corsHeaders)
      }
    }

    // Step 9: cascades user_profiles, proposals, proposal_sections,
    // proposal_chats, proposal_documents, proposal_assumptions, invites,
    // templates, template_sections, chunks, document_extracts, usage_events,
    // salesforce_connections (13 tables).
    const { error: deleteOrgError } = await admin
      .from('organizations')
      .delete()
      .eq('id', org_id)
    if (deleteOrgError) {
      return jsonError(500, deleteOrgError.message, corsHeaders)
    }

    // Step 10: one auth account deletion per member. A per-user API call, so
    // partial failure is possible — never abort on one failure, and report
    // honestly rather than a blanket success.
    const memberFailures: { user_id: string; error: string }[] = []
    for (const id of memberIds) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(id)
      if (deleteUserError) {
        memberFailures.push({ user_id: id, error: deleteUserError.message })
      }
    }

    return new Response(
      JSON.stringify({
        deleted: {
          org: org.name,
          members: memberIds.length,
          proposals: proposalsCount ?? 0,
          invites: invitesCount ?? 0,
          chat_sessions: chatSessionsCount ?? 0,
        },
        member_failures: memberFailures,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (_error) {
    return jsonError(500, 'Internal server error', corsHeaders)
  }
})
