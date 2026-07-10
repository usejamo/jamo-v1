import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgLearningSwitches {
  learn_from_won: boolean
  learn_from_submitted: boolean
  learn_from_lost: boolean
}

// Fresh-org defaults (D-01): won=on, submitted/lost=off — mirrors the migration's
// column DEFAULTs so the UI never flashes a false state before the row loads.
const DEFAULT_SWITCHES: OrgLearningSwitches = {
  learn_from_won: true,
  learn_from_submitted: false,
  learn_from_lost: false,
}

// ── Toggle primitive (copied from Settings.tsx lines 138-154, D-08) ───────────

/** Minimalist toggle — div (not button) to avoid global button::before overlay */
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onChange()
      }}
      className={`relative flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${checked ? 'bg-jamo-500 hover:bg-jamo-600' : 'bg-gray-200 hover:bg-gray-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </div>
  )
}

// ── ReferenceLibraryTab ────────────────────────────────────────────────────────
//
// D-06: customer-accessible org Settings surface (not platform /admin).
// D-07: mutation is org-admin-gated. Client-side disable here is UX only — the
// real boundary is the set_org_learning_switches RPC (admin-gated, Plan 03),
// which RAISEs 'not authorized' for a non-admin caller regardless of this UI.

export function ReferenceLibraryTab() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'

  const [switches, setSwitches] = useState<OrgLearningSwitches>(DEFAULT_SWITCHES)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!profile?.org_id) {
        setLoading(false)
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('organizations')
        .select('learn_from_won, learn_from_submitted, learn_from_lost')
        .eq('id', profile.org_id)
        .single()

      if (!cancelled && data) {
        setSwitches({
          learn_from_won: data.learn_from_won ?? DEFAULT_SWITCHES.learn_from_won,
          learn_from_submitted: data.learn_from_submitted ?? DEFAULT_SWITCHES.learn_from_submitted,
          learn_from_lost: data.learn_from_lost ?? DEFAULT_SWITCHES.learn_from_lost,
        })
      }
      if (!cancelled) setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [profile?.org_id])

  async function handleToggle(key: keyof OrgLearningSwitches) {
    if (!isAdmin || pending) return

    const previous = switches
    const next = { ...switches, [key]: !switches[key] }
    setSwitches(next)
    setPending(true)
    setError(null)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcError } = await (supabase as any).rpc('set_org_learning_switches', {
        p_learn_from_won: next.learn_from_won,
        p_learn_from_submitted: next.learn_from_submitted,
        p_learn_from_lost: next.learn_from_lost,
      })

      if (rpcError) {
        setSwitches(previous)
        setError(
          typeof rpcError.message === 'string' && rpcError.message.includes('not authorized')
            ? 'Only org admins can change these settings.'
            : 'Failed to save. Please try again.'
        )
      }
    } catch {
      setSwitches(previous)
      setError('Failed to save. Please try again.')
    } finally {
      setPending(false)
    }
  }

  const rows: { key: keyof OrgLearningSwitches; label: string; sub?: string }[] = [
    { key: 'learn_from_won', label: 'Learn from won proposals' },
    {
      key: 'learn_from_submitted',
      label: 'Learn from submitted (in-flight) proposals',
      sub: 'Includes proposals that are currently live with a client — submitted but not yet won or lost.',
    },
    { key: 'learn_from_lost', label: 'Learn from lost proposals' },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      <div className="p-6">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
          Reference Library
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Control which of your organization&apos;s past proposals jamo may draw on as reference
          material when generating new proposals. Draft proposals are never used as a reference
          for another proposal, regardless of these settings.
        </p>

        {!isAdmin && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
            Only org admins can change these settings.
          </p>
        )}

        {error && (
          <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 italic">Loading…</p>
        ) : (
          <div className="space-y-0 divide-y divide-gray-50">
            {rows.map((row, i) => (
              <div
                key={row.key}
                className={`flex items-start justify-between gap-6 py-3.5 ${i === 0 ? 'pt-0' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{row.label}</p>
                  {row.sub && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{row.sub}</p>}
                </div>
                <div className="pt-0.5 shrink-0">
                  <Toggle
                    checked={switches[row.key]}
                    onChange={() => handleToggle(row.key)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
