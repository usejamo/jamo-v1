import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// ── Icons (inline-SVG-function convention, matches TemplatesTab.tsx:4-38 — no icon library) ──

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
    </svg>
  )
}

function IconBan({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  )
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function IconUserCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" />
    </svg>
  )
}

// ── Role/status data ─────────────────────────────────────────────────────────

const INVITE_ROLE_OPTIONS: { value: 'admin' | 'user'; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
]

interface Member {
  user_id: string
  email: string | null
  full_name: string | null
  role: string
  is_active: boolean
}

type InviteStatus = 'pending' | 'accepted' | 'revoked'

interface PendingInvite {
  id: string
  email: string
  role: string
  status: InviteStatus
  created_at: string
}

function displayName(member: Member): string {
  return member.full_name || member.email || 'Unnamed teammate'
}

// ── Badges ────────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'admin'
  return (
    <span
      className={`text-xs font-normal px-2 py-0.5 rounded-full shrink-0 capitalize ${
        isAdmin ? 'text-jamo-600 bg-jamo-50' : 'text-gray-500 bg-gray-100'
      }`}
    >
      {role}
    </span>
  )
}

function InviteStatusBadge({ status }: { status: InviteStatus }) {
  if (status === 'pending') {
    return (
      <span className="text-xs font-normal text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
        Pending
      </span>
    )
  }
  if (status === 'accepted') {
    return (
      <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">
        Accepted
      </span>
    )
  }
  return (
    <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
      Revoked
    </span>
  )
}

// ── Deactivate confirmation dialog (verbatim DeleteDialog shape, TemplatesTab.tsx:391-440) ──

function DeactivateDialog({
  memberName,
  onConfirm,
  onCancel,
  submitting,
}: {
  memberName: string
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Deactivate {memberName}?</h2>
        <p className="text-sm text-gray-600 mb-6">
          They will immediately lose access to this organization.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Revoke invite confirmation dialog (verbatim DeleteDialog shape) ──────────

function RevokeInviteDialog({
  email,
  onConfirm,
  onCancel,
  submitting,
}: {
  email: string
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Revoke invite?</h2>
        <p className="text-sm text-gray-600 mb-6">
          {email} will no longer be able to accept using this link.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TeamTab ──────────────────────────────────────────────────────────────────

export function TeamTab() {
  const { profile } = useAuth()

  // Invite card
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Member list
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Member | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [memberActionError, setMemberActionError] = useState<string | null>(null)

  // Pending invites sub-list (own org only)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [invitesError, setInvitesError] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<PendingInvite | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  async function fetchMembers() {
    setMembersLoading(true)
    setMembersError(null)
    const { data, error } = await supabase.functions.invoke('team-manage', {
      body: { action: 'list_members' },
    })
    if (error) {
      setMembersError('Failed to load team members. Please refresh and try again.')
    } else if (data?.members) {
      setMembers(data.members as Member[])
    }
    setMembersLoading(false)
  }

  async function fetchPendingInvites() {
    setInvitesLoading(true)
    setInvitesError(null)
    // invites_select_own_org RLS scopes this to the caller's own org — no
    // service-role client, so another org's invites can never load here.
    const { data, error } = await supabase
      .from('invites')
      .select('id, email, role, status, created_at')
      .neq('status', 'accepted')
      .order('created_at', { ascending: false })
    if (error) {
      setInvitesError('Failed to load pending invites. Please refresh and try again.')
    } else if (data) {
      setPendingInvites(data as PendingInvite[])
    }
    setInvitesLoading(false)
  }

  useEffect(() => {
    fetchMembers()
    fetchPendingInvites()
  }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    const trimmedEmail = inviteEmail.trim()
    if (!trimmedEmail) return

    setInviting(true)
    setInviteError(null)

    const { error } = await supabase.functions.invoke('team-invite', {
      body: { email: trimmedEmail, role: inviteRole },
    })

    if (error) {
      setInviteError("Couldn't send the invite. Check the email address and try again.")
      setInviting(false)
      return
    }

    setInviteEmail('')
    setInviteRole('user')
    setInviting(false)
    await fetchPendingInvites()
  }

  async function handleChangeRole(member: Member) {
    const nextRole: 'admin' | 'user' = member.role === 'admin' ? 'user' : 'admin'
    setChangingRoleId(member.user_id)
    setMemberActionError(null)
    const { error } = await supabase.functions.invoke('team-manage', {
      body: { action: 'change_role', targetUserId: member.user_id, role: nextRole },
    })
    if (error) {
      setMemberActionError("Couldn't change that teammate's role. Please try again.")
    } else {
      await fetchMembers()
    }
    setChangingRoleId(null)
  }

  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return
    const target = deactivateTarget
    setDeactivatingId(target.user_id)
    setMemberActionError(null)
    setDeactivateTarget(null)

    const { error } = await supabase.functions.invoke('team-manage', {
      body: { action: 'deactivate', targetUserId: target.user_id },
    })
    if (error) {
      setMemberActionError("Couldn't deactivate that teammate. Please try again.")
    } else {
      await fetchMembers()
    }
    setDeactivatingId(null)
  }

  async function handleReactivate(member: Member) {
    setReactivatingId(member.user_id)
    setMemberActionError(null)
    const { error } = await supabase.functions.invoke('team-manage', {
      body: { action: 'reactivate', targetUserId: member.user_id },
    })
    if (error) {
      setMemberActionError("Couldn't reactivate that teammate. Please try again.")
    } else {
      await fetchMembers()
    }
    setReactivatingId(null)
  }

  async function handleResend(invite: PendingInvite) {
    setResendingId(invite.id)
    setInvitesError(null)
    const { error } = await supabase.functions.invoke('team-invite', {
      body: { action: 'resend', inviteId: invite.id },
    })
    if (error) {
      setInvitesError("Couldn't resend the invite. Please try again.")
    } else {
      await fetchPendingInvites()
    }
    setResendingId(null)
  }

  async function handleRevokeConfirm() {
    if (!revokeTarget) return
    const target = revokeTarget
    setRevokingId(target.id)
    setInvitesError(null)
    setRevokeTarget(null)

    const { error } = await supabase.functions.invoke('team-invite', {
      body: { action: 'revoke', inviteId: target.id },
    })
    if (error) {
      setInvitesError("Couldn't revoke the invite. Please try again.")
    } else {
      await fetchPendingInvites()
    }
    setRevokingId(null)
  }

  return (
    <div className="space-y-8">

      {/* ── Card 1: Invite a teammate ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Invite a teammate</h2>
        <p className="text-sm text-gray-500 mb-4">
          They'll receive an email invite to join {profile?.org_id ? 'your organization' : 'this workspace'}.
        </p>

        <form onSubmit={handleInvite} className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="team-invite-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="team-invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
              placeholder="teammate@company.com"
              disabled={inviting}
            />
          </div>
          <div>
            <label htmlFor="team-invite-role" className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              id="team-invite-role"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as 'admin' | 'user')}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none bg-white"
              disabled={inviting}
            >
              {INVITE_ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="inline-flex items-center gap-2 text-sm font-medium text-white bg-jamo-500 hover:bg-jamo-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {inviting ? 'Sending…' : 'Invite Teammate'}
          </button>
        </form>

        {inviteError && (
          <div role="alert" className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {inviteError}
          </div>
        )}
      </div>

      {/* ── Card 2: Team members ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Team members</h2>

        {(membersError || memberActionError) && (
          <div role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {membersError || memberActionError}
          </div>
        )}

        {membersLoading ? (
          <p className="text-sm text-gray-400 italic">Loading team members…</p>
        ) : members.length <= 1 ? (
          <div className="text-center py-6">
            <p className="text-sm font-semibold text-gray-900">You're the only member</p>
            <p className="text-sm text-gray-500 mt-1">Invite teammates to start collaborating on proposals.</p>
          </div>
        ) : (
          <div>
            {members.map(member => {
              const name = displayName(member)
              const isSelf = member.user_id === profile?.user_id
              return (
                <div key={member.user_id} className="border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                        <RoleBadge role={member.role} />
                        {isSelf && (
                          <span className="text-xs font-normal text-gray-400 shrink-0">(You)</span>
                        )}
                      </div>
                      {member.email && member.full_name && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{member.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {member.is_active ? (
                        <span className="text-sm text-green-600">Active</span>
                      ) : (
                        <span className="text-sm text-gray-500">Deactivated</span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleChangeRole(member)}
                        aria-label={`Change role for ${name}`}
                        disabled={changingRoleId === member.user_id}
                        className="flex items-center justify-center text-gray-400 hover:text-jamo-600 transition-colors disabled:opacity-50"
                        style={{ width: 44, height: 44 }}
                        title="Change Role"
                      >
                        <IconShield className="w-4 h-4" />
                      </button>

                      {member.is_active ? (
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(member)}
                          aria-label={`Deactivate ${name}`}
                          disabled={deactivatingId === member.user_id}
                          className="flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          style={{ width: 44, height: 44 }}
                          title="Deactivate"
                        >
                          <IconBan className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleReactivate(member)}
                          aria-label={`Reactivate ${name}`}
                          disabled={reactivatingId === member.user_id}
                          className="flex items-center justify-center text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50"
                          style={{ width: 44, height: 44 }}
                          title="Reactivate"
                        >
                          <IconUserCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Pending invites (own org only) ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Pending Invites</h2>

        {invitesError && (
          <div role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {invitesError}
          </div>
        )}

        {invitesLoading ? (
          <p className="text-sm text-gray-400 italic">Loading invites…</p>
        ) : pendingInvites.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm font-semibold text-gray-900">No pending invites</p>
            <p className="text-sm text-gray-500 mt-1">Invites you send will appear here until they're accepted.</p>
          </div>
        ) : (
          <div>
            {pendingInvites.map(invite => (
              <div key={invite.id} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{invite.email}</p>
                      <InviteStatusBadge status={invite.status} />
                      <RoleBadge role={invite.role} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Invited {new Date(invite.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    {invite.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleResend(invite)}
                          aria-label={`Resend invite to ${invite.email}`}
                          disabled={resendingId === invite.id}
                          className="flex items-center justify-center text-gray-400 hover:text-jamo-600 transition-colors disabled:opacity-50"
                          style={{ width: 44, height: 44 }}
                          title="Resend Invite"
                        >
                          <IconMail className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokeTarget(invite)}
                          aria-label={`Revoke invite to ${invite.email}`}
                          disabled={revokingId === invite.id}
                          className="flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          style={{ width: 44, height: 44 }}
                          title="Revoke Invite"
                        >
                          <IconBan className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      {deactivateTarget && (
        <DeactivateDialog
          memberName={displayName(deactivateTarget)}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setDeactivateTarget(null)}
          submitting={deactivatingId === deactivateTarget.user_id}
        />
      )}

      {revokeTarget && (
        <RevokeInviteDialog
          email={revokeTarget.email}
          onConfirm={handleRevokeConfirm}
          onCancel={() => setRevokeTarget(null)}
          submitting={revokingId === revokeTarget.id}
        />
      )}

    </div>
  )
}
