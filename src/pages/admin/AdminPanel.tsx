import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { baseSlug } from '../../lib/slug'

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Org {
  id: string
  name: string
  slug: string
  plan: string
  created_at: string
}

type InviteStatus = 'pending' | 'accepted' | 'revoked'

interface InviteListRow {
  id: string
  email: string
  org_id: string
  role: 'super_admin' | 'admin' | 'user'
  status: InviteStatus
  created_at: string
  organizations: { name: string } | null
}

const VALID_PLANS = ['trial', 'paid'] as const
type Plan = (typeof VALID_PLANS)[number]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Best-effort extraction of the `{ error }` JSON body an admin-* edge fn
 * returns via jsonError (_shared/auth.ts) — falls back to a generic message
 * if the response can't be parsed (network failure, non-JSON body, etc). */
async function extractServerError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null | undefined)?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body && typeof body.error === 'string' && body.error.trim()) {
        return body.error
      }
    } catch {
      // fall through to fallback
    }
  }
  return fallback
}

// ── Status badge ──────────────────────────────────────────────────────────────

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

// ── Invite-first-admin dialog ─────────────────────────────────────────────────

function InviteAdminDialog({
  org,
  email,
  onEmailChange,
  onSubmit,
  onCancel,
  sending,
  error,
}: {
  org: Org
  email: string
  onEmailChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
  sending: boolean
  error: string | null
}) {
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Invite first admin</h2>
        <p className="text-sm text-gray-500 mb-4">
          Organization: <span className="font-medium text-gray-700">{org.name}</span>
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-admin-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              ref={emailRef}
              id="invite-admin-email"
              type="email"
              required
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
              placeholder="admin@company.com"
              disabled={sending}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-sm font-medium text-gray-700 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="text-sm font-medium text-white bg-jamo-500 hover:bg-jamo-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Revoke invite dialog (verbatim DeleteDialog shape, TemplatesTab.tsx:391-440) ──

function RevokeInviteDialog({
  email,
  onConfirm,
  onCancel,
  revoking,
}: {
  email: string
  onConfirm: () => void
  onCancel: () => void
  revoking: boolean
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
            disabled={revoking}
            className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {revoking ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AdminPanel ────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  // Org list + create-org form
  const [orgs, setOrgs] = useState<Org[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)

  const [orgName, setOrgName] = useState('')
  const [orgPlan, setOrgPlan] = useState<Plan>('trial')
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [createOrgError, setCreateOrgError] = useState<string | null>(null)

  // Invite-first-admin dialog
  const [inviteTarget, setInviteTarget] = useState<Org | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Pending invites list
  const [invites, setInvites] = useState<InviteListRow[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [invitesError, setInvitesError] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<InviteListRow | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [lifecycleError, setLifecycleError] = useState<string | null>(null)

  async function fetchOrgs() {
    setOrgsLoading(true)
    setOrgsError(null)
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, plan, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      setOrgsError('Failed to load organizations. Please refresh and try again.')
    } else if (data) {
      setOrgs(data as Org[])
    }
    setOrgsLoading(false)
  }

  async function fetchInvites() {
    setInvitesLoading(true)
    setInvitesError(null)
    const { data, error } = await supabase.functions.invoke('admin-invites-lifecycle', {
      body: { action: 'list' },
    })
    if (error) {
      setInvitesError('Failed to load pending invites. Please refresh and try again.')
    } else if (data?.invites) {
      setInvites(data.invites as InviteListRow[])
    }
    setInvitesLoading(false)
  }

  useEffect(() => {
    fetchOrgs()
    fetchInvites()
  }, [])

  async function handleCreateOrg(e: FormEvent) {
    e.preventDefault()
    const trimmedName = orgName.trim()
    if (!trimmedName) return

    setCreatingOrg(true)
    setCreateOrgError(null)

    const { error } = await supabase.functions.invoke('admin-create-org', {
      body: { name: trimmedName, plan: orgPlan },
    })

    if (error) {
      const message = await extractServerError(
        error,
        'This organization name is already taken. Try a slightly different name.'
      )
      setCreateOrgError(message)
      setCreatingOrg(false)
      return
    }

    setOrgName('')
    setOrgPlan('trial')
    setCreatingOrg(false)
    await fetchOrgs()
  }

  function openInviteDialog(org: Org) {
    setInviteTarget(org)
    setInviteEmail('')
    setInviteError(null)
  }

  async function handleSendInvite(e: FormEvent) {
    e.preventDefault()
    if (!inviteTarget) return
    const trimmedEmail = inviteEmail.trim()
    if (!trimmedEmail) return

    setSendingInvite(true)
    setInviteError(null)

    const { error } = await supabase.functions.invoke('admin-invite-first-admin', {
      body: { email: trimmedEmail, targetOrgId: inviteTarget.id },
    })

    if (error) {
      setInviteError("Couldn't send the invite. Check the email address and try again.")
      setSendingInvite(false)
      return
    }

    setSendingInvite(false)
    setInviteTarget(null)
    setInviteEmail('')
    await fetchInvites()
  }

  async function handleResend(invite: InviteListRow) {
    setResendingId(invite.id)
    setLifecycleError(null)
    const { error } = await supabase.functions.invoke('admin-invites-lifecycle', {
      body: { action: 'resend', inviteId: invite.id },
    })
    if (error) {
      setLifecycleError("Couldn't resend the invite. Please try again.")
    } else {
      await fetchInvites()
    }
    setResendingId(null)
  }

  async function handleRevokeConfirm() {
    if (!revokeTarget) return
    const target = revokeTarget
    setRevokingId(target.id)
    setLifecycleError(null)
    setRevokeTarget(null)

    const { error } = await supabase.functions.invoke('admin-invites-lifecycle', {
      body: { action: 'revoke', inviteId: target.id },
    })

    if (error) {
      setLifecycleError("Couldn't revoke the invite. Please try again.")
    } else {
      await fetchInvites()
    }
    setRevokingId(null)
  }

  const slugPreview = orgName.trim() ? baseSlug(orgName) : ''

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Platform Admin</h1>
        <p className="text-sm text-gray-500 mt-1">
          Provision client organizations and manage admin invitations.
        </p>
      </div>

      {/* ── Create-org form ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Create an organization</h2>
        <p className="text-sm text-gray-500 mb-4">
          New client organizations start with no members — invite a first admin once created.
        </p>

        <form onSubmit={handleCreateOrg} className="space-y-4 max-w-lg">
          <div>
            <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="org-name"
              type="text"
              required
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
              placeholder="Acme Clinical Research"
              disabled={creatingOrg}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              URL: <span className="font-mono">{slugPreview || '—'}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <div className="flex items-center gap-2">
              {VALID_PLANS.map(plan => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setOrgPlan(plan)}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                    orgPlan === plan
                      ? 'bg-jamo-50 text-jamo-700 border-jamo-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {plan}
                </button>
              ))}
            </div>
          </div>

          {createOrgError && (
            <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {createOrgError}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={creatingOrg || !orgName.trim()}
              className="inline-flex items-center gap-2 text-sm font-medium text-white bg-jamo-500 hover:bg-jamo-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creatingOrg ? 'Creating…' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Org list ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Organizations</h2>

        {orgsError && (
          <div role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {orgsError}
          </div>
        )}

        {orgsLoading ? (
          <p className="text-sm text-gray-400 italic">Loading organizations…</p>
        ) : orgs.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm font-semibold text-gray-900">No organizations yet</p>
            <p className="text-sm text-gray-500 mt-1">Create your first client organization to get started.</p>
          </div>
        ) : (
          <div>
            {orgs.map(org => (
              <div key={org.id} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{org.name}</p>
                      <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0 capitalize">
                        {org.plan}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{org.slug}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <button
                      type="button"
                      onClick={() => openInviteDialog(org)}
                      className="text-sm font-medium text-jamo-600 hover:text-jamo-700 transition-colors"
                    >
                      Invite Admin
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pending invites list ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Pending Invites</h2>

        {(invitesError || lifecycleError) && (
          <div role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {invitesError || lifecycleError}
          </div>
        )}

        {invitesLoading ? (
          <p className="text-sm text-gray-400 italic">Loading invites…</p>
        ) : invites.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm font-semibold text-gray-900">No pending invites</p>
            <p className="text-sm text-gray-500 mt-1">Invites you send will appear here until they're accepted.</p>
          </div>
        ) : (
          <div>
            {invites.map(invite => (
              <div key={invite.id} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{invite.email}</p>
                      <InviteStatusBadge status={invite.status} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {invite.organizations?.name ?? '—'} · {invite.role} · Invited{' '}
                      {new Date(invite.created_at).toLocaleDateString()}
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
      {inviteTarget && (
        <InviteAdminDialog
          org={inviteTarget}
          email={inviteEmail}
          onEmailChange={setInviteEmail}
          onSubmit={handleSendInvite}
          onCancel={() => setInviteTarget(null)}
          sending={sendingInvite}
          error={inviteError}
        />
      )}

      {revokeTarget && (
        <RevokeInviteDialog
          email={revokeTarget.email}
          onConfirm={handleRevokeConfirm}
          onCancel={() => setRevokeTarget(null)}
          revoking={revokingId === revokeTarget.id}
        />
      )}
    </div>
  )
}
