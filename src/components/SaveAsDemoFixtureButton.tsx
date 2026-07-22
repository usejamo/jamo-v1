import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

const DEMO_ORG_SLUG = 'jamo-demo'

export interface SaveAsDemoFixtureButtonProps {
  /** Source proposal to capture. */
  proposalId: string
  /** Caller's role from useAuth().profile. */
  role?: string | null
  /** Caller's own org id from useAuth().profile. */
  orgId?: string | null
}

/**
 * Runtime demo-org resolution. Returns true when the given org is flagged
 * `feature_flags.is_demo` or carries the canonical `jamo-demo` slug.
 */
export async function resolveIsDemoOrg(orgId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, slug, feature_flags')
    .eq('id', orgId)
    .maybeSingle()

  if (error || !data) return false
  const flags = (data.feature_flags ?? {}) as Record<string, unknown>
  return flags.is_demo === true || data.slug === DEMO_ORG_SLUG
}

/**
 * Pull the edge function's own message out of a functions.invoke error.
 *
 * demo-capture-fixture returns precise, actionable failures (`403 super_admin
 * required`, `400 source proposal has ungenerated section(s): <names>`, …) as
 * `{ error: message }`. supabase-js surfaces those as a FunctionsHttpError
 * whose `.message` is a generic "non-2xx status code" string and whose
 * `.context` is the raw Response — so the useful text must be read off the
 * body, otherwise the presenter sees nothing actionable.
 */
export async function extractInvokeErrorMessage(err: unknown): Promise<string> {
  const context = (err as { context?: unknown } | null)?.context
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json()
      const serverMessage = (body as { error?: unknown } | null)?.error
      if (typeof serverMessage === 'string' && serverMessage.trim()) {
        return serverMessage
      }
    } catch {
      // Body was not JSON / already consumed — fall back to the error message.
    }
  }
  const message = (err as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim()
    ? message
    : 'Capture failed. Please try again.'
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
        setError(await extractInvokeErrorMessage(invokeError))
        return
      }

      const version = (data as { version?: number } | null)?.version
      setCaptured({ version: typeof version === 'number' ? version : null })
    } catch (err) {
      setError(await extractInvokeErrorMessage(err))
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
