import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolveIsDemoOrg } from '../lib/demoOrg'
import { extractInvokeErrorMessage } from '../lib/invokeError'

// ── SaveAsDemoFixtureButton (16-07, D-04) ────────────────────────────────────
//
// Capture entry point: turns a live demo-org proposal into a versioned
// `demo_fixtures` record by invoking the `demo-capture-fixture` edge function.
//
// GATE (cosmetic only): rendered for a `super_admin` whose OWN org is the demo
// org. The demo org is resolved at RUNTIME (`feature_flags.is_demo` or the
// `jamo-demo` slug) — never a hardcoded UUID. Two super_admins exist (the demo
// presenter and the Phase-15 internal account), so "is a super_admin" alone is
// not a sufficient condition; the check must be org-scoped.
//
// The REAL boundary is server-side: demo-capture-fixture re-reads the caller's
// role from `user_profiles` and asserts the source proposal belongs to the demo
// org (403 otherwise). This component does not duplicate or weaken that gate —
// hiding the affordance is a UX affordance, not enforcement.

// `resolveIsDemoOrg` and `extractInvokeErrorMessage` moved to src/lib/demoOrg.ts
// and src/lib/invokeError.ts in 16-08, when the demo run surface became a second
// caller of both. One implementation, two call sites — not two copies.

const CAPTURE_FALLBACK_ERROR = 'Capture failed. Please try again.'

export interface SaveAsDemoFixtureButtonProps {
  /** Source proposal to capture. */
  proposalId: string
  /** Caller's role from useAuth().profile. */
  role?: string | null
  /** Caller's own org id from useAuth().profile. */
  orgId?: string | null
}

export function SaveAsDemoFixtureButton({
  proposalId,
  role,
  orgId,
}: SaveAsDemoFixtureButtonProps) {
  const isSuperAdmin = role === 'super_admin'
  const [inDemoOrg, setInDemoOrg] = useState(false)
  const [pending, setPending] = useState(false)
  const [captured, setCaptured] = useState<{ version: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin || !orgId) {
      setInDemoOrg(false)
      return
    }
    let cancelled = false
    resolveIsDemoOrg(orgId)
      .then(result => {
        if (!cancelled) setInDemoOrg(result)
      })
      .catch(() => {
        if (!cancelled) setInDemoOrg(false)
      })
    return () => {
      cancelled = true
    }
  }, [isSuperAdmin, orgId])

  async function handleCapture() {
    if (pending) return
    setPending(true)
    setError(null)
    setCaptured(null)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'demo-capture-fixture',
        { body: { source_proposal_id: proposalId } }
      )

      if (invokeError) {
        setError(await extractInvokeErrorMessage(invokeError, CAPTURE_FALLBACK_ERROR))
        return
      }

      const version = (data as { version?: number } | null)?.version
      setCaptured({ version: typeof version === 'number' ? version : null })
    } catch (err) {
      setError(await extractInvokeErrorMessage(err, CAPTURE_FALLBACK_ERROR))
    } finally {
      setPending(false)
    }
  }

  if (!isSuperAdmin || !inDemoOrg) return null

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleCapture}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 transition-colors ${
          pending ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-300'
        }`}
      >
        {pending ? 'Capturing…' : 'Save as demo fixture'}
      </button>

      {captured && (
        <span role="status" className="text-xs text-green-700">
          {captured.version !== null
            ? `Captured as fixture v${captured.version}`
            : 'Captured as a new fixture'}
        </span>
      )}

      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  )
}
