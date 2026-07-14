import { useState } from 'react'
import type { FormEvent } from 'react'
import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { baseSlug } from '../../lib/slug'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Org {
  id: string
  name: string
  slug: string
  plan: string
  created_at: string
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

  useEffect(() => {
    fetchOrgs()
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

    </div>
  )
}
